// >>> SANAD-BRANDS: reads for a brand's Email tab. Every query is scoped by orgId.
import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class BrandEmailRepository {
  constructor(private _prisma: PrismaRepository<'integration' | 'post' | 'postBrief' | 'user'>) {}

  emailChannels(orgId: string, customerId: string) {
    return this._prisma.model.integration.findMany({
      where: { organizationId: orgId, customerId, providerIdentifier: 'listmonk', deletedAt: null, disabled: false },
      select: { id: true, name: true, customInstanceDetails: true },
    });
  }

  postsByRelease(orgId: string, integrationId: string, releaseURLs: string[]) {
    if (!releaseURLs.length) return Promise.resolve([] as { id: string; releaseURL: string | null }[]);
    return this._prisma.model.post.findMany({
      where: { organizationId: orgId, integrationId, deletedAt: null, releaseURL: { in: releaseURLs } },
      select: { id: true, releaseURL: true },
    });
  }

  briefsByPost(postIds: string[]) {
    if (!postIds.length) return Promise.resolve([] as { postId: string | null; review: string; sentById: string | null; sentAt: Date | null; decidedById: string | null; decidedAt: Date | null }[]);
    return this._prisma.model.postBrief.findMany({
      where: { postId: { in: postIds } },
      select: { postId: true, review: true, sentById: true, sentAt: true, decidedById: true, decidedAt: true },
    });
  }

  async userNames(ids: string[]) {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const rows = await this._prisma.model.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
    for (const u of rows) out.set(u.id, u.name || u.email);
    return out;
  }
}
// <<< SANAD-BRANDS
