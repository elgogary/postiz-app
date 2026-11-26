// >>> SANAD-BRANDS: briefs, the brand's Postiz posts and their comments. Callers pass the brand's own integration ids
// (from BrandsService.context), so a post of another brand or org is never read or written here.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import type { BriefWrite } from '@gitroom/helpers/brands/post.rules';

const briefText = (b: BriefWrite) => ({
  plannedAt: new Date(b.plannedAt), format: b.format, goal: b.goal, pillars: b.pillars, title: b.title, sub: b.sub,
  caption: b.caption, slidesLabel: b.slidesLabel, slides: b.slides, visual: b.visual, imagePrompt: b.imagePrompt,
  why: b.why, verify: b.verify,
});

@Injectable()
export class BrandPostsRepository {
  constructor(private _prisma: PrismaRepository<'postBrief' | 'post' | 'comments' | 'user'>) {}

  briefs(orgId: string, customerId: string) {
    return this._prisma.model.postBrief.findMany({ where: { orgId, customerId } });
  }

  brief(orgId: string, customerId: string, id: string) {
    return this._prisma.model.postBrief.findFirst({ where: { id, orgId, customerId } });
  }

  briefForPost(orgId: string, customerId: string, postId: string) {
    return this._prisma.model.postBrief.findFirst({ where: { postId, orgId, customerId } });
  }

  posts(orgId: string, integrationIds: string[], from: Date, to: Date, alsoIds: string[]) {
    return this._prisma.model.post.findMany({
      where: {
        organizationId: orgId, deletedAt: null, parentPostId: null, integrationId: { in: integrationIds },
        OR: [{ publishDate: { gte: from, lte: to } }, { id: { in: alsoIds } }],
      },
      select: {
        id: true, group: true, publishDate: true, state: true, content: true, image: true, integrationId: true,
        integration: { select: { name: true } },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
      orderBy: { publishDate: 'asc' },
    });
  }

  post(orgId: string, integrationIds: string[], id: string) {
    return this._prisma.model.post.findFirst({
      where: { id, organizationId: orgId, deletedAt: null, parentPostId: null, integrationId: { in: integrationIds } },
      select: { id: true, group: true, publishDate: true, state: true, content: true, image: true, integrationId: true },
    });
  }

  lastNotes(postIds: string[]) {
    if (!postIds.length) return Promise.resolve([]);
    return this._prisma.model.comments.findMany({
      where: { postId: { in: postIds }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, postId: true, content: true, userId: true, createdAt: true },
    });
  }

  comments(postId: string) {
    return this._prisma.model.comments.findMany({
      where: { postId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, userId: true, createdAt: true },
    });
  }

  addComment(orgId: string, postId: string, userId: string, content: string) {
    return this._prisma.model.comments.create({ data: { organizationId: orgId, postId, userId, content } });
  }

  async names(ids: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return {};
    const users = await this._prisma.model.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return Object.fromEntries(users.map((u) => [u.id, u.name || '']));
  }

  // Re-import keeps review state, the link to the post, ticks and comments; it refreshes the planned text and time.
  briefUpsert(orgId: string, customerId: string, b: BriefWrite, postId?: string) {
    return this._prisma.model.postBrief.upsert({
      where: { customerId_planRef: { customerId, planRef: b.planRef } },
      create: { orgId, customerId, planRef: b.planRef, ...briefText(b), ...(postId ? { postId } : {}) },
      update: { ...briefText(b), ...(postId ? { postId } : {}) },
    });
  }

  createBrief(data: Prisma.PostBriefUncheckedCreateInput) {
    return this._prisma.model.postBrief.create({ data });
  }

  updateBrief(id: string, data: Prisma.PostBriefUncheckedUpdateInput) {
    return this._prisma.model.postBrief.update({ where: { id }, data });
  }

  waiting(orgId: string) {
    return this._prisma.model.postBrief.findMany({
      where: { orgId, review: { in: ['IN_REVIEW', 'SENT_BACK'] } },
      select: { customerId: true, review: true, sentById: true },
    });
  }
}
// <<< SANAD-BRANDS
