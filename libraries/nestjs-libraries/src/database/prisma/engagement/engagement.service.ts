import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EngagementRepository } from '@gitroom/nestjs-libraries/database/prisma/engagement/engagement.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { EngagementScraperManager } from '@gitroom/nestjs-libraries/integrations/engagement/engagement.scraper.manager';
import { NormalizedPost } from '@gitroom/nestjs-libraries/integrations/engagement/linkedin.scraper.interface';
import {
  EngagementTargetDto,
  UpdateDraftDto,
} from '@gitroom/nestjs-libraries/dtos/engagement/engagement.dto';

const DEFAULT_VOICE =
  process.env.ENGAGEMENT_BRAND_VOICE ||
  'A pragmatic enterprise-solutions architect. Warm, concrete, value-first, no hype, no hashtags, no emojis.';

@Injectable()
export class EngagementService {
  constructor(
    private _repo: EngagementRepository,
    private _openai: OpenaiService,
    private _scraper: EngagementScraperManager
  ) {}

  getTargets(orgId: string) {
    return this._repo.getTargets(orgId);
  }

  upsertTarget(orgId: string, body: EngagementTargetDto) {
    return this._repo.upsertTarget(orgId, body);
  }

  deleteTarget(orgId: string, id: string) {
    return this._repo.deleteTarget(orgId, id);
  }

  getQueue(orgId: string, status?: string) {
    return this._repo.getQueue(orgId, status);
  }

  getHealth(orgId: string) {
    return this._repo.getHealth(orgId);
  }

  // Pull the target's latest post via the active adapter.
  // Returns { needsManual: true } whenever the manual fallback is active OR the vendor errors/times
  // out OR the pull is empty (guardrail 3: a dead-but-configured vendor never breaks the queue).
  async pullTarget(orgId: string, targetId: string) {
    const target = await this._repo.getTarget(orgId, targetId);
    if (!target) {
      throw new NotFoundException('Target not found');
    }
    const adapter = this._scraper.pick();
    if (adapter.identifier === 'manual') {
      return { needsManual: true };
    }
    let post: NormalizedPost | null = null;
    try {
      post = await adapter.getLatestPost(
        target.linkedinUrl,
        target.linkedinUrn || undefined
      );
    } catch {
      // vendor down / rate-limited / timed out -> fall back to manual paste
      return { needsManual: true };
    }
    await this._repo.bumpLastPulled(orgId, targetId);
    if (!post) {
      return { needsManual: true };
    }
    // Idempotency: don't create a second draft for the same post on a repeat pull.
    if (post.postUrn) {
      const dup = await this._repo.findDraftByPostUrn(
        orgId,
        targetId,
        post.postUrn
      );
      if (dup) {
        return { draft: dup, needsManual: false };
      }
    }
    const draft = await this._repo.createDraft(orgId, {
      targetId,
      postUrn: post.postUrn,
      postUrl: post.url,
      postText: post.text,
    });
    return { draft, needsManual: false };
  }

  // Manual paste path: the human supplies the post text they are already looking at.
  async createManualDraft(
    orgId: string,
    targetId: string,
    postText: string,
    postUrl?: string
  ) {
    const target = await this._repo.getTarget(orgId, targetId);
    if (!target) {
      throw new NotFoundException('Target not found');
    }
    return this._repo.createDraft(orgId, { targetId, postText, postUrl });
  }

  async generateDraft(orgId: string, draftId: string) {
    const draft = await this._repo.getDraft(orgId, draftId);
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (!draft.postText) {
      throw new BadRequestException('Draft has no post text to comment on');
    }
    let comment = '';
    try {
      comment = await this._openai.generateEngagementComment(
        draft.postText,
        DEFAULT_VOICE,
        400
      );
    } catch (e) {
      comment = '';
    }
    if (!comment) {
      throw new BadRequestException(
        'AI drafting is unavailable right now — write the comment yourself in the box below'
      );
    }
    // Reset edited=false: AI output re-locks posting so a human must rewrite AGAIN after any regenerate.
    await this._repo.updateDraftText(orgId, draftId, comment, false);
    return this._repo.getDraft(orgId, draftId);
  }

  // Human edit: only a non-empty change to the current text counts as an edit (can't flip the gate
  // with an unchanged or empty save). Never downgrades an already-edited draft.
  async editDraft(orgId: string, draftId: string, body: UpdateDraftDto) {
    const draft = await this._repo.getDraft(orgId, draftId);
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (typeof body.draftText === 'string') {
      const next = body.draftText.trim();
      const meaningful = next.length > 0 && next !== (draft.draftText || '').trim();
      await this._repo.updateDraftText(
        orgId,
        draftId,
        body.draftText,
        draft.edited || meaningful
      );
    }
    if (body.status && body.status !== 'posted') {
      await this._repo.setDraftStatus(orgId, draftId, body.status);
    }
    return this._repo.getDraft(orgId, draftId);
  }

  // Guardrail 5: the edited gate + "not already posted" live in the repo WHERE (atomic + idempotent).
  async markPosted(orgId: string, draftId: string) {
    const draft = await this._repo.getDraft(orgId, draftId);
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    if (!draft.edited) {
      throw new BadRequestException(
        'Rewrite the draft in your own words before marking it posted'
      );
    }
    await this._repo.markDraftPosted(orgId, draftId);
    return this._repo.getDraft(orgId, draftId);
  }

  deleteDraft(orgId: string, draftId: string) {
    return this._repo.deleteDraft(orgId, draftId);
  }
}
