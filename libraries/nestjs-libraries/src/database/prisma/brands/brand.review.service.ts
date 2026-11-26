// >>> SANAD-BRANDS: a brand's posts as cards, the review actions (spec rules 1 to 5) and comments.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PostBrief } from '@prisma/client';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandPostsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.posts.repository';
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
});

const pinsOf = (b: PostBrief | null): Record<string, number> =>
  (b?.slideComments && typeof b.slideComments === 'object' ? (b.slideComments as Record<string, number>) : {});

@Injectable()
export class BrandReviewService {
  constructor(private _brands: BrandsService, private _repo: BrandPostsRepository, private _posts: PostsService) {}

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
      cards: buildCards(briefs.map(asBrief), rows, names),
    };
  }
}
// <<< SANAD-BRANDS
