// >>> SANAD-BRANDS: ideas of one organization and the plan behind each (brief and its post).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class BrandIdeasRepository {
  constructor(private _prisma: PrismaRepository<'contentIdea' | 'postBrief' | 'post' | '$transaction'>) {}

  list(orgId: string) {
    return this._prisma.model.contentIdea.findMany({
      where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1000,
    });
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
