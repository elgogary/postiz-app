// >>> SANAD-BRANDS: spec rule 2. A new QUEUE (a new post, or a draft becoming scheduled) for a brand whose posts need
// approval is refused on every path; only Approve in Brands calls changePostStatus with approvedByReview. A post that is
// already QUEUE may be saved again (the editor sends "schedule" for its Update button); a PUBLISHED one only with type 'update'.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { approvalBlock } from '@gitroom/helpers/brands/post.rules';
import { AccessRole, OrgRole, resolveBrandRole } from '@gitroom/helpers/brands/brand.rules';

export type Editor = { userId: string; orgRole: OrgRole };

@Injectable()
export class BrandApprovalService {
  constructor(private _prisma: PrismaRepository<'post' | 'integration' | 'brandSettings' | 'postBrief' | 'brandAccess'>) {}

  async blockingBrand(orgId: string, items: { integrationId: string; postId?: string | null }[], opts: { allowPublished?: boolean } = {}): Promise<string | null> {
    const ids = items.map((i) => i.postId).filter((x): x is string => !!x);
    const live = ids.length
      ? await this._prisma.model.post.findMany({
        where: { id: { in: ids }, organizationId: orgId, deletedAt: null, state: { in: opts.allowPublished ? ['QUEUE', 'PUBLISHED'] : ['QUEUE'] } },
        select: { id: true, integrationId: true },
      })
      : [];
    // A live post is exempt only on its own channel: re-saving it onto another brand's channel is a new QUEUE there.
    const byId = new Map(live.map((p) => [p.id, p.integrationId]));
    const already = new Set(items.filter((i) => i.postId && byId.get(i.postId) === i.integrationId).map((i) => i.postId as string));
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

  async assertCanQueue(orgId: string, items: { integrationId: string; postId?: string | null }[], opts: { allowPublished?: boolean } = {}) {
    const name = await this.blockingBrand(orgId, items, opts);
    if (name !== null) {
      throw new ForbiddenException(`${name}: posts need approval. Save it as a draft and send it for review in Brands.`);
    }
  }

  // An approved, scheduled post of a brand that needs approval, saved by someone who may not approve on that brand, goes
  // back to review (its brief) and to Draft (the caller saves it as a draft). No editor (API key, MCP) cannot be an
  // approver. Returns the posts to hold back; putInReview records them once the save has worked.
  async editsNeedingReview(orgId: string, editor: Editor | undefined, postIds: string[]): Promise<{ postId: string; briefId: string }[]> {
    const ids = await this.withRoots(orgId, [...new Set(postIds.filter(Boolean))]);
    if (!ids.length) return [];
    const briefs = await this._prisma.model.postBrief.findMany({
      where: { orgId, postId: { in: ids }, review: 'APPROVED' }, select: { id: true, postId: true, customerId: true },
    });
    if (!briefs.length) return [];
    const queued = await this._prisma.model.post.findMany({
      where: { id: { in: briefs.map((b) => b.postId as string) }, organizationId: orgId, deletedAt: null, parentPostId: null, state: 'QUEUE' },
      select: { id: true },
    });
    const live = new Set(queued.map((p) => p.id));
    const open = briefs.filter((b) => live.has(b.postId as string));
    if (!open.length) return [];
    const customers = [...new Set(open.map((b) => b.customerId))];
    const [settings, access] = await Promise.all([
      this._prisma.model.brandSettings.findMany({ where: { orgId, customerId: { in: customers } }, select: { customerId: true, requiresApproval: true } }),
      editor
        ? this._prisma.model.brandAccess.findMany({ where: { orgId, userId: editor.userId, customerId: { in: customers } }, select: { customerId: true, role: true } })
        : Promise.resolve([] as { customerId: string; role: string }[]),
    ]);
    const off = new Set(settings.filter((s) => !s.requiresApproval).map((s) => s.customerId));
    const roleOf = new Map(access.map((a) => [a.customerId, a.role as AccessRole]));
    return open
      .filter((b) => !off.has(b.customerId) && !(editor && resolveBrandRole(editor.orgRole, roleOf.get(b.customerId)) === 'approve'))
      .map((b) => ({ postId: b.postId as string, briefId: b.id }));
  }

  // A thread child id stands for its root: the brief and the approval belong to the root. Ids are followed up a few levels.
  private async withRoots(orgId: string, ids: string[]): Promise<string[]> {
    const all = new Set(ids);
    let todo = ids;
    for (let i = 0; i < 5 && todo.length; i++) {
      const rows = await this._prisma.model.post.findMany({
        where: { id: { in: todo }, organizationId: orgId, parentPostId: { not: null } }, select: { parentPostId: true },
      });
      todo = rows.map((r) => r.parentPostId).filter((x): x is string => !!x && !all.has(x));
      todo.forEach((x) => all.add(x));
    }
    return [...all];
  }

  async putInReview(briefIds: string[], editor: Editor | undefined) {
    if (!briefIds.length) return;
    await this._prisma.model.postBrief.updateMany({
      where: { id: { in: briefIds } },
      data: {
        review: 'IN_REVIEW', sentById: editor?.userId ?? null, sentAt: new Date(), decidedById: null, decidedAt: null,
        ownCheckedBy: null, listCheckedBy: null,
      },
    });
  }
}
// <<< SANAD-BRANDS
