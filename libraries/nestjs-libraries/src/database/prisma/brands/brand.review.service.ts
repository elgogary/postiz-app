// >>> SANAD-BRANDS: a brand's posts as cards, the review actions (spec rules 1 to 5) and comments.
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PostBrief } from '@prisma/client';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandPostsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.posts.repository';
import { BrandIdeasRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.ideas.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { BrandRole, OrgRole, canApprove, canEdit } from '@gitroom/helpers/brands/brand.rules';
import {
  BriefRow, Card, Format, MEDIA_HINT, MediaItem, Note, PostRow, PostizState, ReviewState, blockOf, buildCards, planWindow,
} from '@gitroom/helpers/brands/post.rules';

const DAY = 86400000;

const mediaOf = (image: string | null): MediaItem[] => {
  try {
    const v = JSON.parse(image || '[]');
    return Array.isArray(v) ? v.filter((m) => m && typeof m.path === 'string').map((m) => ({ path: m.path as string })) : [];
  } catch {
    return [];
  }
};

const toHtml = (text: string) => text.split('\n')
  .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');

const asBrief = (b: PostBrief): BriefRow => ({
  id: b.id, postId: b.postId, plannedAt: b.plannedAt.toISOString(), format: b.format as Format, goal: b.goal,
  pillars: b.pillars, title: b.title, sub: b.sub, caption: b.caption, slidesLabel: b.slidesLabel,
  slides: Array.isArray(b.slides) ? (b.slides as string[]) : [], visual: b.visual, imagePrompt: b.imagePrompt, why: b.why,
  verify: b.verify, firstDraft: b.firstDraft, review: b.review as ReviewState, sentById: b.sentById, decidedById: b.decidedById,
  ideaId: b.ideaId,
});

const pinsOf = (b: PostBrief | null): Record<string, number> =>
  (b?.slideComments && typeof b.slideComments === 'object' ? (b.slideComments as Record<string, number>) : {});

@Injectable()
export class BrandReviewService {
  constructor(private _brands: BrandsService, private _repo: BrandPostsRepository, private _posts: PostsService,
    private _ideas: BrandIdeasRepository) {}

  async cards(orgId: string, userId: string, orgRole: OrgRole, customerId: string) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    const window = planWindow(ctx.focusRows, new Date());
    const briefs = await this._repo.briefs(orgId, customerId);
    const channelIds = ctx.channels.map((c) => c.id);
    const linked = briefs.map((b) => b.postId).filter((x): x is string => !!x);
    const posts = channelIds.length
      ? await this._repo.posts(orgId, channelIds, new Date(Date.parse(`${window.from}T00:00:00Z`) - DAY),
        new Date(Date.parse(`${window.to}T23:59:59Z`) + DAY), linked)
      : [];
    const notes = await this._repo.lastNotes(posts.map((p) => p.id));
    const names = await this._repo.names([
      ...briefs.flatMap((b) => [b.sentById, b.decidedById]), ...notes.map((n) => n.userId),
    ].filter((x): x is string => !!x));
    const pins = new Map(briefs.flatMap((b) => Object.entries(pinsOf(b))));
    const last = new Map<string, Note>();
    for (const n of notes) {
      if (!last.has(n.postId)) last.set(n.postId, { by: names[n.userId] || '', text: n.content, slide: pins.get(n.id) ?? null });
    }
    const rows: PostRow[] = posts.map((p) => ({
      id: p.id, group: p.group, publishDate: p.publishDate.toISOString(), state: p.state as PostizState,
      content: p.content, image: mediaOf(p.image), channel: p.integration?.name || '', comments: p._count.comments,
      lastNote: last.get(p.id) || null,
    }));
    return {
      window, role: ctx.role, requiresApproval: ctx.requiresApproval, checks: ctx.checks,
      channels: ctx.channels.map((c) => ({ id: c.id, name: c.name })),
      // A brief made only to hold a post's review (no planRef) disappears with its post; a plan item or a planned idea
      // stays as Planned.
      cards: buildCards(briefs.filter((b) => b.planRef || b.ideaId || (b.postId && rows.some((r) => r.id === b.postId))).map(asBrief), rows, names),
    };
  }

  private async target(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    const post = await this._repo.post(orgId, ctx.channels.map((c) => c.id), postId);
    if (!post) throw new NotFoundException('Post not found in this brand');
    const brief = await this._repo.briefForPost(orgId, customerId, postId);
    const row: PostRow = {
      id: post.id, group: post.group, publishDate: post.publishDate.toISOString(), state: post.state as PostizState,
      content: post.content, image: mediaOf(post.image), channel: '', comments: 0, lastNote: null,
    };
    const card: Card = buildCards(brief ? [asBrief(brief)] : [], [row], {})[0];
    return { ctx, post, brief, card };
  }

  private mustCreate(role: BrandRole) {
    if (!canEdit(role)) throw new ForbiddenException('You can view this brand but not change it');
  }

  private mustApprove(role: BrandRole) {
    if (!canApprove(role)) throw new ForbiddenException('Only an approver can do this');
  }

  private mustFuture(date: string) {
    const t = Date.parse(date);
    if (Number.isNaN(t) || t <= Date.now() + 60000) throw new BadRequestException('Pick a future date');
  }

  async sendForReview(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const { ctx, post, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustCreate(ctx.role);
    if (!ctx.requiresApproval) throw new BadRequestException('This brand has no approval step: schedule the post instead');
    if (card.state !== 'draft' && card.state !== 'changes') throw new BadRequestException('Only a draft or a sent-back post can be sent for review');
    if (blockOf('sendForReview', card, new Date()) === 'media') throw new BadRequestException(MEDIA_HINT[card.format] || 'Add the media first');
    const data = { review: 'IN_REVIEW', sentById: userId, sentAt: new Date(), decidedById: null, decidedAt: null, ownCheckedBy: null, listCheckedBy: null };
    if (brief) await this._repo.updateBrief(brief.id, data);
    else await this._repo.createBrief({ orgId, customerId, postId, plannedAt: post.publishDate, format: card.format, title: card.title, ...data });
    return { ok: true };
  }

  async approve(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string, dto: { own: boolean; list: boolean }) {
    const { ctx, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustApprove(ctx.role);
    if (!brief || card.state !== 'review') throw new BadRequestException('This post is not waiting for review');
    const block = blockOf('approve', card, new Date(), { own: !!dto.own, list: !!dto.list });
    if (block === 'date') throw new BadRequestException('The date has passed: pick a new date first');
    if (block === 'ticks') throw new BadRequestException('Tick both checks to approve');
    await this._posts.changePostStatus(orgId, postId, 'schedule', true);
    await this._repo.updateBrief(brief.id, {
      review: 'APPROVED', decidedById: userId, decidedAt: new Date(), ownCheckedBy: dto.own ? userId : null, listCheckedBy: userId,
    });
    return { ok: true };
  }

  async sendBack(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string, dto: { reason: string }) {
    const { ctx, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustApprove(ctx.role);
    if (!brief || card.state !== 'review') throw new BadRequestException('This post is not waiting for review');
    const reason = (dto.reason || '').trim();
    if (!reason) throw new BadRequestException('Write what should change');
    await this._repo.addComment(orgId, postId, userId, reason);
    await this._repo.updateBrief(brief.id, { review: 'SENT_BACK', decidedById: userId, decidedAt: new Date() });
    return { ok: true };
  }

  async stop(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const { ctx, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustApprove(ctx.role);
    if (card.state !== 'scheduled' && card.state !== 'review' && card.state !== 'error') throw new BadRequestException('Only a post in review, scheduled or failed can be stopped');
    if (card.state === 'scheduled' || card.state === 'error') await this._posts.changePostStatus(orgId, postId, 'draft');
    if (brief) {
      await this._repo.updateBrief(brief.id, {
        review: 'NONE', decidedById: null, decidedAt: null, ownCheckedBy: null, listCheckedBy: null,
      });
    }
    return { ok: true };
  }

  async schedule(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const { ctx, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustCreate(ctx.role);
    if (ctx.requiresApproval) throw new BadRequestException('This brand needs approval: send the post for review');
    if (card.state !== 'draft' && card.state !== 'changes') throw new BadRequestException('Only a draft can be scheduled');
    const block = blockOf('schedule', card, new Date());
    if (block === 'media') throw new BadRequestException(MEDIA_HINT[card.format] || 'Add the media first');
    if (block === 'date') throw new BadRequestException('The date has passed: pick a new date first');
    await this._posts.changePostStatus(orgId, postId, 'schedule', true);
    return { ok: true };
  }

  async newDate(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string, dto: { date: string }) {
    const { ctx, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustCreate(ctx.role);
    this.mustFuture(dto.date);
    if (card.state === 'scheduled' || card.state === 'published') throw new BadRequestException('Stop the post before moving it');
    await this._posts.changeDate(orgId, postId, dto.date, 'update');
    return { ok: true };
  }

  async briefDate(orgId: string, userId: string, orgRole: OrgRole, customerId: string, briefId: string, dto: { date: string }) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    this.mustCreate(ctx.role);
    this.mustFuture(dto.date);
    const brief = await this._repo.brief(orgId, customerId, briefId);
    if (!brief) throw new NotFoundException('Planned post not found');
    if (brief.postId && await this._repo.post(orgId, ctx.channels.map((c) => c.id), brief.postId)) {
      throw new BadRequestException('This post has a draft: change the draft date');
    }
    await this._repo.updateBrief(brief.id, { plannedAt: new Date(dto.date) });
    return { ok: true };
  }

  async createDraft(orgId: string, userId: string, orgRole: OrgRole, customerId: string, briefId: string, dto: { date: string }) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    this.mustCreate(ctx.role);
    const brief = await this._repo.brief(orgId, customerId, briefId);
    if (!brief) throw new NotFoundException('Planned post not found');
    if (brief.postId && await this._repo.post(orgId, ctx.channels.map((c) => c.id), brief.postId)) {
      throw new BadRequestException('This planned post already has a draft');
    }
    const channel = ctx.channels[0];
    if (!channel) throw new BadRequestException('This brand has no channel yet');
    const body = await this._posts.mapTypeToPost({
      type: 'draft', date: dto.date, tags: [], shortLink: false,
      posts: [{ integration: { id: channel.id }, value: [{ content: toHtml(brief.caption || brief.title), image: [] }], group: randomUUID(), settings: {} }],
    } as never, orgId);
    const [made] = await this._posts.createPost(orgId, body, 'WEB');
    await this._repo.updateBrief(brief.id, {
      postId: made.postId, review: 'NONE', sentById: null, sentAt: null, decidedById: null, decidedAt: null, ownCheckedBy: null, listCheckedBy: null,
    });
    return { postId: made.postId as string };
  }

  // Un-plan: a post planned from an idea and not yet sent for review goes back to the idea as New. The brief is deleted
  // first, by a conditional delete: only one of two racing calls wins, and only the winner deletes the draft.
  async unplan(orgId: string, userId: string, orgRole: OrgRole, customerId: string, briefId: string) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    this.mustCreate(ctx.role);
    const brief = await this._repo.brief(orgId, customerId, briefId);
    if (!brief) throw new NotFoundException('Planned post not found');
    if (!brief.ideaId) throw new BadRequestException('Only a post planned from an idea can be un-planned');
    if (brief.review !== 'NONE') throw new BadRequestException('This post was already sent for review: stop it first');
    let post: { group: string; state: string } | null = brief.postId ? await this._repo.post(orgId, ctx.channels.map((c) => c.id), brief.postId) : null;
    if (!post && brief.postId) {
      // The post may sit on a channel no longer in this brand: it still must not be live when the brief goes.
      const other = await this._repo.postAnywhere(orgId, brief.postId);
      if (other && !other.deletedAt) post = other;
    }
    if (post && post.state !== 'DRAFT') throw new BadRequestException('Only a planned or draft post can be un-planned');
    if ((await this._repo.deleteUnplanned(orgId, brief.id)) !== 1) throw new ConflictException('This post was already un-planned');
    await this._ideas.release(orgId, brief.ideaId, brief.id);
    if (post) await this._posts.deletePost(orgId, post.group);
    return { ok: true };
  }

  async markPublished(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const { ctx, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustApprove(ctx.role);
    if (card.format !== 'Poll') throw new BadRequestException('Only a poll is marked published by hand');
    if (card.state === 'published') throw new BadRequestException('This post is already published');
    if (card.state === 'scheduled') await this._posts.changePostStatus(orgId, postId, 'draft');
    await this._posts.changeState(postId, 'PUBLISHED');
    if (brief) await this._repo.updateBrief(brief.id, { review: 'APPROVED', decidedById: userId, decidedAt: new Date() });
    return { ok: true };
  }

  async comments(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string) {
    const { brief } = await this.target(orgId, userId, orgRole, customerId, postId);
    const list = await this._repo.comments(postId);
    const names = await this._repo.names(list.map((c) => c.userId));
    const pins = pinsOf(brief);
    return list.map((c) => ({ id: c.id, by: names[c.userId] || '', text: c.content, at: c.createdAt.toISOString(), slide: pins[c.id] ?? null }));
  }

  async addComment(orgId: string, userId: string, orgRole: OrgRole, customerId: string, postId: string, dto: { content: string; slide?: number }) {
    const { ctx, post, brief, card } = await this.target(orgId, userId, orgRole, customerId, postId);
    this.mustCreate(ctx.role);
    const text = (dto.content || '').trim();
    if (!text) throw new BadRequestException('Write a comment');
    const made = await this._repo.addComment(orgId, postId, userId, text);
    if (dto.slide) {
      if (brief) await this._repo.updateBrief(brief.id, { slideComments: { ...pinsOf(brief), [made.id]: dto.slide } });
      else await this._repo.createBrief({ orgId, customerId, postId, plannedAt: post.publishDate, format: card.format, title: card.title, slideComments: { [made.id]: dto.slide } });
    }
    return { id: made.id };
  }
}
// <<< SANAD-BRANDS
