// >>> SANAD-BRANDS: ideas of one organization and the plan behind each (brief and its post).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export const LIST_CAP = 1000;

@Injectable()
export class BrandIdeasRepository {
  constructor(private _prisma: PrismaRepository<'contentIdea' | 'postBrief' | 'post' | '$transaction'>) {}

  // The page shows the newest LIST_CAP ideas; one more is read so the page can say there are more.
  list(orgId: string) {
    return this._prisma.model.contentIdea.findMany({
      where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: LIST_CAP + 1,
    });
  }

  // Every idea not yet split into fields, with no cap, so a migration never skips the older ones.
  unmigrated(orgId: string) {
    return this._prisma.model.contentIdea.findMany({ where: { organizationId: orgId, deletedAt: null, hook: '' } });
  }

  idea(orgId: string, id: string) {
    return this._prisma.model.contentIdea.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
  }

  create(data: Prisma.ContentIdeaUncheckedCreateInput) {
    return this._prisma.model.contentIdea.create({ data });
  }

  async update(orgId: string, id: string, data: Prisma.ContentIdeaUncheckedUpdateManyInput) {
    await this._prisma.model.contentIdea.updateMany({ where: { id, organizationId: orgId, deletedAt: null }, data });
    return this.idea(orgId, id);
  }

  // Marks a new idea Planned, with its brief id and brands, only if it is still new: two clicks on Plan it make one
  // planned post, and the idea never reads Planned without the id of its brief.
  async claim(orgId: string, id: string, briefId: string, brandIds: string[]) {
    const r = await this._prisma.model.contentIdea.updateMany({
      where: { id, organizationId: orgId, deletedAt: null, status: 'NEW', briefId: null }, data: { status: 'PLANNED', briefId, brandIds },
    });
    return r.count === 1;
  }

  // Un-plan: the idea is New again with no brief, only if it still points at this brief.
  async release(orgId: string, id: string, briefId: string) {
    const r = await this._prisma.model.contentIdea.updateMany({
      where: { id, organizationId: orgId, deletedAt: null, briefId }, data: { status: 'NEW', briefId: null },
    });
    return r.count === 1;
  }

  // Drop and Restore change the status only from the one it was read in, and never on a planned idea.
  async moveStatus(orgId: string, id: string, from: string, to: string) {
    const r = await this._prisma.model.contentIdea.updateMany({
      where: { id, organizationId: orgId, deletedAt: null, status: from, briefId: null }, data: { status: to },
    });
    return r.count === 1;
  }

  updateOp(orgId: string, id: string, data: Prisma.ContentIdeaUncheckedUpdateManyInput) {
    return this._prisma.model.contentIdea.updateMany({ where: { id, organizationId: orgId, deletedAt: null }, data });
  }

  saveAll(ops: Prisma.PrismaPromise<unknown>[]) {
    return this._prisma.model.$transaction(ops);
  }

  async plans(orgId: string, briefIds: string[]) {
    if (!briefIds.length) return [];
    const briefs = await this._prisma.model.postBrief.findMany({
      where: { orgId, id: { in: briefIds } }, select: { id: true, customerId: true, plannedAt: true, postId: true },
    });
    const postIds = briefs.map((b) => b.postId).filter((x): x is string => !!x);
    const posts = postIds.length
      ? await this._prisma.model.post.findMany({
        where: { id: { in: postIds }, organizationId: orgId, deletedAt: null }, select: { id: true, state: true, publishDate: true },
      })
      : [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    return briefs.map((b) => {
      const p = b.postId ? byId.get(b.postId) : undefined;
      return { briefId: b.id, brandId: b.customerId, date: (p?.publishDate || b.plannedAt).toISOString(), postId: p?.id || null, postState: p?.state || null };
    });
  }
}
// <<< SANAD-BRANDS
