import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { EngagementTargetDto } from '@gitroom/nestjs-libraries/dtos/engagement/engagement.dto';

// One repository over both models (PrismaRepository accepts a union of camelCase accessor keys).
// Every read filters { organizationId, deletedAt: null }; writes use updateMany scoped by org so a
// guessed cross-tenant id updates 0 rows.
@Injectable()
export class EngagementRepository {
  constructor(
    private _prisma: PrismaRepository<
    'engagementTarget' | 'commentDraft' | 'contentIdea'
  >
  ) {}

  getTargets(orgId: string) {
    return this._prisma.model.engagementTarget.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: [{ tier: 'asc' }, { createdAt: 'desc' }],
    });
  }

  getTarget(orgId: string, id: string) {
    return this._prisma.model.engagementTarget.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  // Read-then-write, but CREATE always uses a fresh server id so a client-supplied id can never
  // collide with a soft-deleted or cross-org row (avoids P2002 + the cross-org existence oracle).
  async upsertTarget(orgId: string, body: EngagementTargetDto) {
    if (body.id) {
      const existing = await this.getTarget(orgId, body.id);
      if (existing) {
        return this._prisma.model.engagementTarget.update({
          where: { id: body.id },
          data: {
            name: body.name,
            linkedinUrl: body.linkedinUrl,
            headline: body.headline,
            ...(body.tier ? { tier: body.tier } : {}),
          },
        });
      }
    }
    return this._prisma.model.engagementTarget.create({
      data: {
        id: uuidv4(),
        organizationId: orgId,
        name: body.name,
        linkedinUrl: body.linkedinUrl,
        headline: body.headline,
        tier: body.tier || 'B',
      },
    });
  }

  // Soft-delete the target AND cascade to its drafts so orphaned drafts don't linger in the queue/health.
  async deleteTarget(orgId: string, id: string) {
    await this._prisma.model.commentDraft.updateMany({
      where: { targetId: id, organizationId: orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return this._prisma.model.engagementTarget.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  // Only bumps lastPulledAt. We do NOT cache a urn here — linkedinUrn holds a PROFILE urn and the
  // post urn is a different value; writing it back corrupts the next pull. The adapter resolves the
  // profile urn itself when needed.
  bumpLastPulled(orgId: string, id: string) {
    return this._prisma.model.engagementTarget.updateMany({
      where: { id, organizationId: orgId },
      data: { lastPulledAt: new Date() },
    });
  }

  // >>> SANAD-ENGAGEMENT
  // Cron feed: due targets across ALL orgs (never pulled, or pulled longer ago than minAgeMinutes).
  // A-tier first, oldest pull first, capped at limit to stay gentle on the scraper quota.
  getAllPullable(minAgeMinutes: number, limit: number) {
    const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000);
    return this._prisma.model.engagementTarget.findMany({
      where: {
        deletedAt: null,
        OR: [{ lastPulledAt: null }, { lastPulledAt: { lt: cutoff } }],
      },
      select: { id: true, organizationId: true },
      orderBy: [
        { tier: 'asc' },
        { lastPulledAt: { sort: 'asc', nulls: 'first' } },
      ],
      take: limit,
    });
  }
  // <<< SANAD-ENGAGEMENT

  // >>> SANAD-ENGAGEMENT (content ideas)
  addContentIdea(
    orgId: string,
    data: { idea: string; note?: string; source?: string; tags?: string[] }
  ) {
    return this._prisma.model.contentIdea.create({
      data: {
        organizationId: orgId,
        idea: data.idea,
        note: data.note,
        source: data.source,
        tags: data.tags || [],
      },
    });
  }

  listContentIdeas(orgId: string, limit = 500) {
    return this._prisma.model.contentIdea.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  deleteContentIdea(orgId: string, id: string) {
    return this._prisma.model.contentIdea.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  updateContentIdea(
    orgId: string,
    id: string,
    data: { idea?: string; note?: string; tags?: string[] }
  ) {
    return this._prisma.model.contentIdea.updateMany({
      where: { id, organizationId: orgId },
      data: {
        ...(data.idea !== undefined ? { idea: data.idea } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
      },
    });
  }
  // <<< SANAD-ENGAGEMENT

  getQueue(orgId: string, status?: string) {
    return this._prisma.model.commentDraft.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(status ? { status } : { status: { in: ['pending', 'approved'] } }),
      },
      include: { target: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  getDraft(orgId: string, id: string) {
    return this._prisma.model.commentDraft.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  findDraftByPostUrn(orgId: string, targetId: string, postUrn: string) {
    return this._prisma.model.commentDraft.findFirst({
      where: {
        organizationId: orgId,
        targetId,
        postUrn,
        deletedAt: null,
      },
    });
  }

  createDraft(
    orgId: string,
    data: {
      targetId: string;
      postUrn?: string;
      postUrl?: string;
      postText?: string;
      draftText?: string;
    }
  ) {
    return this._prisma.model.commentDraft.create({
      data: {
        organizationId: orgId,
        targetId: data.targetId,
        postUrn: data.postUrn,
        postUrl: data.postUrl,
        postText: data.postText,
        draftText: data.draftText,
        status: 'pending',
        edited: false,
      },
    });
  }

  // edited is set to the EXACT value passed (generate resets it to false; a real human edit sets true).
  updateDraftText(
    orgId: string,
    id: string,
    draftText: string,
    edited: boolean
  ) {
    return this._prisma.model.commentDraft.updateMany({
      where: { id, organizationId: orgId },
      data: { draftText, edited },
    });
  }

  setDraftStatus(orgId: string, id: string, status: string) {
    return this._prisma.model.commentDraft.updateMany({
      where: { id, organizationId: orgId },
      data: { status },
    });
  }

  // Atomic + idempotent posted transition. The guardrail (edited:true) and the "not already posted"
  // check live in the WHERE, so a double-click re-runs as a 0-row no-op and never re-stamps postedAt.
  markDraftPosted(orgId: string, id: string) {
    return this._prisma.model.commentDraft.updateMany({
      where: {
        id,
        organizationId: orgId,
        edited: true,
        status: { not: 'posted' },
        deletedAt: null,
      },
      data: { status: 'posted', postedAt: new Date() },
    });
  }

  deleteDraft(orgId: string, id: string) {
    return this._prisma.model.commentDraft.updateMany({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  // Health tab: ONLY real, first-party/public metrics (guardrail 4 — no private-data score here).
  async getHealth(orgId: string) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [targets, byStatus, postedThisWeek, engaged] = await Promise.all([
      this._prisma.model.engagementTarget.count({
        where: { organizationId: orgId, deletedAt: null },
      }),
      this._prisma.model.commentDraft.groupBy({
        by: ['status'],
        where: { organizationId: orgId, deletedAt: null },
        _count: true,
      }),
      this._prisma.model.commentDraft.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'posted',
          postedAt: { gte: since },
        },
      }),
      this._prisma.model.commentDraft.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: 'posted',
          postedAt: { gte: since },
        },
        select: { targetId: true },
        distinct: ['targetId'],
      }),
    ]);
    return {
      targets,
      byStatus,
      postedThisWeek,
      coverage: engaged.length,
    };
  }
}
