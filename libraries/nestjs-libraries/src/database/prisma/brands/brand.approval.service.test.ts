// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brand.approval.service.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { BrandApprovalService } from './brand.approval.service';

const fake = (posts: { id: string }[], channels: { customerId: string; name: string }[], off: string[]) => ({
  model: {
    post: { findMany: async () => posts },
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
  await new BrandApprovalService(fake([{ id: 'p1' }], [{ customerId: 'm', name: 'Moon' }], []) as never)
    .assertCanQueue('o', [{ integrationId: 'i1', postId: 'p1' }]);
});
