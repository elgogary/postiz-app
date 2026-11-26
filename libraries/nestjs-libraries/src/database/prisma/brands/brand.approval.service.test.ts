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
