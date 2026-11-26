// >>> SANAD-BRANDS: spec rule 2. A new QUEUE (a new post, or a draft becoming scheduled) for a brand whose posts need
// approval is refused on every path; only Approve in Brands calls changePostStatus with approvedByReview. A post that is
// already QUEUE or PUBLISHED may be saved again (the editor sends "schedule" for its Update button).
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { approvalBlock } from '@gitroom/helpers/brands/post.rules';

@Injectable()
export class BrandApprovalService {
  constructor(private _prisma: PrismaRepository<'post' | 'integration' | 'brandSettings'>) {}

  async blockingBrand(orgId: string, items: { integrationId: string; postId?: string | null }[]): Promise<string | null> {
    const ids = items.map((i) => i.postId).filter((x): x is string => !!x);
    const live = ids.length
      ? await this._prisma.model.post.findMany({
        where: { id: { in: ids }, organizationId: orgId, deletedAt: null, state: { in: ['QUEUE', 'PUBLISHED'] } },
        select: { id: true },
      })
      : [];
    const already = new Set(live.map((p) => p.id));
    const integrationIds = [...new Set(items.filter((i) => !i.postId || !already.has(i.postId)).map((i) => i.integrationId))];
    if (!integrationIds.length) return null;
    const channels = await this._prisma.model.integration.findMany({
      where: { id: { in: integrationIds }, organizationId: orgId, customerId: { not: null } },
      select: { customerId: true, customer: { select: { name: true } } },
    });
    if (!channels.length) return null;
    const settings = await this._prisma.model.brandSettings.findMany({
      where: { orgId, customerId: { in: channels.map((c) => c.customerId as string) } },
      select: { customerId: true, requiresApproval: true },
    });
    return approvalBlock(channels.map((c) => ({ customerId: c.customerId as string, name: c.customer?.name || '' })), settings);
  }

  async assertCanQueue(orgId: string, items: { integrationId: string; postId?: string | null }[]) {
    const name = await this.blockingBrand(orgId, items);
    if (name !== null) {
      throw new ForbiddenException(`${name}: posts need approval. Save it as a draft and send it for review in Brands.`);
    }
  }
}
// <<< SANAD-BRANDS
