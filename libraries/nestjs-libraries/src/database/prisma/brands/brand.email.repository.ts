// >>> SANAD-BRANDS: reads for a brand's Email tab. Every query is scoped by orgId.
import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { HistoryInput } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.history';

@Injectable()
export class BrandEmailRepository {
  constructor(private _prisma: PrismaRepository<'integration' | 'post' | 'postBrief' | 'user' | 'brandEmailHistory'>) {}

  emailChannels(orgId: string, customerId: string) {
    return this._prisma.model.integration.findMany({
      where: { organizationId: orgId, customerId, providerIdentifier: 'listmonk', deletedAt: null, disabled: false },
      select: { id: true, name: true, customInstanceDetails: true },
    });
  }

  postsByRelease(orgId: string, integrationId: string, releaseURLs: string[]) {
    if (!releaseURLs.length) return Promise.resolve([] as { id: string; releaseURL: string | null }[]);
    return this._prisma.model.post.findMany({
      where: { organizationId: orgId, integrationId, releaseURL: { in: releaseURLs } },
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

  history(orgId: string, customerId: string) {
    return this._prisma.model.brandEmailHistory.findMany({ where: { orgId, customerId }, orderBy: { sentAt: 'desc' } });
  }

  historyOne(orgId: string, customerId: string, sourceId: string) {
    return this._prisma.model.brandEmailHistory.findFirst({ where: { orgId, customerId, source: 'brevo', sourceId } });
  }

  // Idempotent: the same Brevo campaign for the same org updates its row (counts frozen at the latest import).
  saveHistory(orgId: string, customerId: string, importedById: string, h: HistoryInput) {
    const data = { ...h, links: h.links as object, customerId };
    return this._prisma.model.brandEmailHistory.upsert({
      where: { orgId_source_sourceId: { orgId, source: 'brevo', sourceId: h.sourceId } },
      create: { ...data, orgId, source: 'brevo', importedById },
      update: data,
    });
  }
}
// <<< SANAD-BRANDS
