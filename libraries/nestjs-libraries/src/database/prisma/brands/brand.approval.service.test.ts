// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brand.approval.service.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { BrandApprovalService } from './brand.approval.service';

type FakePost = { id: string; integrationId: string; organizationId?: string; state?: string };
// Honours the where of the real query: id, organization and state.
const fake = (posts: FakePost[], channels: { customerId: string; name: string }[], off: string[]) => ({
  model: {
    post: {
      findMany: async ({ where }: { where: { id: { in: string[] }; organizationId: string; state: { in: string[] } } }) =>
        posts.filter((p) => where.id.in.includes(p.id) && (p.organizationId ?? 'o') === where.organizationId && where.state.in.includes(p.state ?? 'QUEUE')),
    },
    integration: { findMany: async () => channels.map((c) => ({ customerId: c.customerId, customer: { name: c.name } })) },
    brandSettings: { findMany: async () => off.map((customerId) => ({ customerId, requiresApproval: false })) },
  },
});

test('a new post for a brand that needs approval is refused', async () => {
  const s = new BrandApprovalService(fake([], [{ customerId: 'm', name: 'Moon' }], []) as never);
  await assert.rejects(s.assertCanQueue('o', [{ integrationId: 'i1' }]), (e) => e instanceof ForbiddenException && /Moon/.test(e.message));
});

test('approval off, no brand, or an already scheduled post pass', async () => {
  await new BrandApprovalService(fake([], [{ customerId: 'm', name: 'Moon' }], ['m']) as never).assertCanQueue('o', [{ integrationId: 'i1' }]);
  await new BrandApprovalService(fake([], [], []) as never).assertCanQueue('o', [{ integrationId: 'i1' }]);
  await new BrandApprovalService(fake([{ id: 'p1', integrationId: 'i1' }], [{ customerId: 'm', name: 'Moon' }], []) as never)
    .assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }]);
});

test('a live post re-saved onto another channel is checked as a new post there', async () => {
  const s = new BrandApprovalService(fake([{ id: 'p1', integrationId: 'i9' }], [{ customerId: 'm', name: 'Moon' }], []) as never);
  await assert.rejects(s.assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }]), ForbiddenException);
});

const moon = [{ customerId: 'm', name: 'Moon' }];

test('a published post passes only with allowPublished', async () => {
  const posts = [{ id: 'p1', integrationId: 'i1', state: 'PUBLISHED' }];
  await new BrandApprovalService(fake(posts, moon, []) as never).assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }], { allowPublished: true });
  await assert.rejects(new BrandApprovalService(fake(posts, moon, []) as never).assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }]), ForbiddenException);
});

test('a queued post of another organization is not exempt', async () => {
  const posts = [{ id: 'p1', integrationId: 'i1', state: 'QUEUE', organizationId: 'other' }];
  await assert.rejects(new BrandApprovalService(fake(posts, moon, []) as never).assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }]), ForbiddenException);
});

// Rule: an edit by someone who may not approve sends an approved, scheduled post back to review.
function editSetup(o: { brief?: boolean; queued?: boolean; off?: boolean; access?: string } = {}) {
  const updates: unknown[] = [];
  const prisma = { model: {
    postBrief: {
      findMany: async () => (o.brief === false ? [] : [{ id: 'b1', postId: 'p1', customerId: 'm' }]),
      updateMany: async (a: unknown) => { updates.push(a); return {}; },
    },
    post: { findMany: async () => (o.queued === false ? [] : [{ id: 'p1' }]) },
    brandSettings: { findMany: async () => (o.off ? [{ customerId: 'm', requiresApproval: false }] : []) },
    brandAccess: { findMany: async () => (o.access ? [{ customerId: 'm', role: o.access }] : []) },
  } };
  return { svc: new BrandApprovalService(prisma as never), updates };
}
const ed = (orgRole: 'USER' | 'ADMIN' = 'USER') => ({ userId: 'u1', orgRole });

test('an editor without the approve right sends an approved post back to review', async () => {
  for (const access of [undefined, 'VIEW', 'CREATE']) {
    const { svc, updates } = editSetup({ access });
    const held = await svc.editsNeedingReview('o', ed(), ['p1']);
    assert.deepEqual(held, [{ postId: 'p1', briefId: 'b1' }]);
    await svc.putInReview(held.map((h) => h.briefId), ed());
    const data = (updates[0] as { data: Record<string, unknown> }).data;
    assert.equal(data.review, 'IN_REVIEW');
    assert.equal(data.sentById, 'u1');
    assert.equal(data.decidedById, null);
    assert.equal(data.decidedAt, null);
  }
});

test('an approver (brand approve or org admin) editing keeps the post approved', async () => {
  assert.deepEqual(await editSetup({ access: 'APPROVE' }).svc.editsNeedingReview('o', ed(), ['p1']), []);
  assert.deepEqual(await editSetup().svc.editsNeedingReview('o', ed('ADMIN'), ['p1']), []);
});

test('a save with no known editor (API key, MCP) counts as a non-approver', async () => {
  assert.equal((await editSetup().svc.editsNeedingReview('o', undefined, ['p1'])).length, 1);
});

test('a brand without an approval step, a post with no approved brief, or a post not scheduled is unchanged', async () => {
  assert.deepEqual(await editSetup({ off: true }).svc.editsNeedingReview('o', ed(), ['p1']), []);
  assert.deepEqual(await editSetup({ brief: false }).svc.editsNeedingReview('o', ed(), ['p1']), []);
  assert.deepEqual(await editSetup({ queued: false }).svc.editsNeedingReview('o', ed(), ['p1']), []);
  assert.deepEqual(await editSetup().svc.editsNeedingReview('o', ed(), ['', '']), []);
});
