// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brand.ideas.service.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BrandIdeasService } from './brand.ideas.service';

const FUTURE = new Date(Date.now() + 5 * 86400000).toISOString();
const ideaRow = (over: Record<string, unknown> = {}) => ({
  id: 'i1', organizationId: 'o', idea: 'Hook: H\nAngle: A\nBullets:\n- b', note: null, source: null, tags: [], createdAt: new Date(),
  deletedAt: null, hook: '', angle: '', bullets: [], brandIds: ['acc'], topic: '', pillars: [], format: '', status: 'NEW', briefId: null, ...over,
});

function setup(opts: { role?: string; rows?: Record<string, unknown>[]; draft?: unknown; orgRole?: string; claimed?: boolean; briefFails?: boolean; draftFails?: boolean; channels?: { id: string }[] } = {}) {
  const calls: unknown[][] = [];
  const rows = opts.rows || [ideaRow()];
  const brands = {
    list: async () => [{ id: 'acc', name: 'Acme', role: opts.role || 'create' }, { id: 'opt', name: 'Optima', role: 'view' }],
    context: async (_o: string, _u: string, _r: string, customerId: string) => {
      if (!['acc', 'opt'].includes(customerId)) throw new NotFoundException('Brand not found');
      return { customer: { id: customerId, name: customerId === 'acc' ? 'Acme' : 'Optima' }, role: customerId === 'acc' ? (opts.role || 'create') : 'view', requiresApproval: true, channels: opts.channels || [{ id: 'ch1' }], focusRows: [], checks: 1 };
    },
    get: async () => ({ sections: { voice: { content: '<p>Short.</p>' }, review: { rows: [['No client names']] } } }),
    pillarsByBrand: async () => ({ acc: ['Ops'] }),
  };
  const repo = {
    list: async () => rows,
    unmigrated: async () => rows.filter((r) => !r.hook),
    idea: async (_o: string, id: string) => rows.find((r) => r.id === id) || null,
    create: async (data: Record<string, unknown>) => { calls.push(['create', data]); return { ...ideaRow(), ...data, id: 'new' }; },
    update: async (_o: string, id: string, data: Record<string, unknown>) => { calls.push(['update', id, data]); return { ...rows.find((r) => r.id === id), ...data }; },
    claim: async (_o: string, id: string, briefId: string, brandIds: string[]) => { calls.push(['claim', id, briefId, brandIds]); return opts.claimed !== false; },
    updateOp: (_o: string, id: string, data: Record<string, unknown>) => { calls.push(['updateOp', id, data]); return {}; },
    saveAll: async (ops: unknown[]) => { calls.push(['saveAll', ops.length]); return []; },
    plans: async () => [{ briefId: 'b9', brandId: 'acc', date: FUTURE, postId: 'p9', postState: 'PUBLISHED' }],
  };
  const posts = {
    createBrief: async (data: Record<string, unknown>) => { calls.push(['createBrief', data]); if (opts.briefFails) throw new Error('db down'); return { id: data.id }; },
    updateBrief: async (id: string, data: Record<string, unknown>) => { calls.push(['updateBrief', id, data]); return {}; },
  };
  const review = { createDraft: async (...a: unknown[]) => { calls.push(['createDraft', ...a]); if (opts.draftFails) throw new BadRequestException('This brand has no channel yet'); return { postId: 'pNew' }; } };
  const drafts = { write: async () => { calls.push(['write']); return opts.draft === undefined ? { caption: 'Cap', slidesLabel: 'Slides', slides: ['s'] } : opts.draft; } };
  const svc = new BrandIdeasService(brands as never, repo as never, posts as never, review as never, drafts as never);
  return { svc, calls, args: ['o', 'u1', (opts.orgRole || 'USER')] as const };
}

test('list filters by scope and reads Posted from the linked post', async () => {
  const rows = [ideaRow(), ideaRow({ id: 'i2', brandIds: [] }), ideaRow({ id: 'i3', brandIds: ['acc'], status: 'PLANNED', briefId: 'b9' })];
  const s = setup({ rows });
  assert.deepEqual((await s.svc.list(...s.args, 'acc')).ideas.map((i) => i.id), ['i1', 'i3']);
  assert.deepEqual((await s.svc.list(...s.args, 'none')).ideas.map((i) => i.id), ['i2']);
  const all = await s.svc.list(...s.args, 'all');
  assert.equal(all.ideas.length, 3);
  assert.equal(all.ideas.find((i) => i.id === 'i3')?.status, 'POSTED');
  assert.deepEqual(all.brands.find((b) => b.id === 'acc')?.pillars, ['Ops']);
  await assert.rejects(s.svc.list(...s.args, 'zzz'), NotFoundException);
});

test('add needs a hook and a brand the person may create on; it stores the fields and the old text', async () => {
  const s = setup();
  await assert.rejects(s.svc.create(...s.args, { hook: '  ', brandIds: ['acc'] }), BadRequestException);
  await assert.rejects(s.svc.create(...s.args, { hook: 'H', brandIds: ['opt'] }), ForbiddenException);
  await assert.rejects(s.svc.create(...s.args, { hook: 'H', brandIds: ['zzz'] }), BadRequestException);
  await s.svc.create(...s.args, { hook: ' H ', angle: 'A', bullets: ['b', ' '], brandIds: ['acc'], topic: 'Nope', format: 'Reel' });
  const data = s.calls[0][1] as Record<string, unknown>;
  assert.equal(data.hook, 'H');
  assert.deepEqual(data.bullets, ['b']);
  assert.equal(data.topic, 'General');
  assert.equal(data.format, '');
  assert.equal(data.idea, 'Hook: H\nAngle: A\nBullets:\n- b');
  assert.equal(data.status, 'NEW');
});

test('drop only a new idea; restore only a dropped one', async () => {
  const s = setup({ rows: [ideaRow(), ideaRow({ id: 'i2', status: 'PLANNED', briefId: 'b1' }), ideaRow({ id: 'i3', status: 'DROPPED' })] });
  await s.svc.setStatus(...s.args, 'i1', 'DROPPED');
  await assert.rejects(s.svc.setStatus(...s.args, 'i2', 'DROPPED'), BadRequestException);
  await s.svc.setStatus(...s.args, 'i3', 'NEW');
  await assert.rejects(s.svc.setStatus(...s.args, 'i1', 'NEW'), BadRequestException);
  assert.deepEqual(s.calls.map((c) => [c[1], (c[2] as { status: string }).status]), [['i1', 'DROPPED'], ['i3', 'NEW']]);
});

test('migrate: admins only; the dry run reports and writes nothing; tags map to brands by name or the sent map', async () => {
  const rows = [ideaRow({ tags: ['Acme', 'Pricing & costing logic'], brandIds: [] }), ideaRow({ id: 'i2', tags: ['JDCo'], idea: 'Loose text. More.', brandIds: [] }),
    ideaRow({ id: 'i3', tags: [], brandIds: [] }), ideaRow({ id: 'i4', hook: 'done already', brandIds: ['acc'] })];
  await assert.rejects(setup({ rows }).svc.migrate('o', 'u1', 'USER', { dryRun: true }), ForbiddenException);
  const s = setup({ rows, orgRole: 'ADMIN' });
  const dry = await s.svc.migrate('o', 'u1', 'ADMIN', { dryRun: true, tagMap: { JDCo: 'opt', Bad: 'zzz' } });
  assert.deepEqual(dry, { dryRun: true, total: 3, split: 2, noBrand: 1, byBrand: { Acme: 1, Optima: 1 }, byTopic: { 'Pricing & costing logic': 1, General: 2 } });
  assert.equal(s.calls.length, 0);
  await s.svc.migrate('o', 'u1', 'ADMIN', { dryRun: false, tagMap: { JDCo: 'opt' } });
  assert.deepEqual(s.calls.at(-1), ['saveAll', 3]);
  assert.deepEqual((s.calls[0][2] as { brandIds: string[] }).brandIds, ['acc']);
});

test('plan it: AI on writes a first draft; AI failing still plans; only a new idea of this brand; viewers cannot', async () => {
  const s = setup();
  const res = await s.svc.plan(...s.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Carousel', ai: true });
  assert.deepEqual(s.calls.map((c) => c[0]), ['claim', 'createBrief', 'write', 'updateBrief', 'createDraft']);
  const [, , briefId, brandIds] = s.calls[0] as [string, string, string, string[]];
  assert.deepEqual(res, { briefId, firstDraft: true, aiFailed: false });
  assert.deepEqual(brandIds, ['acc']);
  assert.deepEqual([(s.calls[1][1] as { id: string }).id, (s.calls[1][1] as { ideaId: string }).ideaId], [briefId, 'i1']);
  assert.equal((s.calls[3][2] as { firstDraft: boolean }).firstDraft, true);

  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await setup().svc.plan(...s.args, 'i1', { customerId: 'acc', date: today, format: 'Text', ai: false })).firstDraft, false);
  await assert.rejects(setup().svc.plan(...s.args, 'i1', { customerId: 'acc', date: '2020-01-01T00:00:00Z', format: 'Text', ai: false }), BadRequestException);

  const lost = setup({ claimed: false });
  await assert.rejects(lost.svc.plan(...lost.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: false }), BadRequestException);
  assert.ok(!lost.calls.some((c) => c[0] === 'createBrief'));

  const broken = setup({ briefFails: true });
  await assert.rejects(broken.svc.plan(...broken.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: true }), /db down/);
  assert.deepEqual(broken.calls.at(-1), ['update', 'i1', { status: 'NEW', briefId: null, brandIds: ['acc'] }]);

  const failed = setup({ draft: null });
  const f = await failed.svc.plan(...failed.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: true });
  assert.deepEqual([f.firstDraft, f.aiFailed], [false, true]);
  assert.ok(!failed.calls.some((c) => c[0] === 'createDraft'));

  const noDraft = setup({ draftFails: true });
  const n = await noDraft.svc.plan(...noDraft.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: true });
  assert.deepEqual([n.firstDraft, n.aiFailed], [false, true]);
  assert.ok(noDraft.calls.some((c) => c[0] === 'updateBrief'), 'the AI text stays on the planned post');

  const noChannel = setup({ channels: [] });
  const c = await noChannel.svc.plan(...noChannel.args, 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: true });
  assert.deepEqual([c.firstDraft, c.aiFailed], [false, true]);
  assert.ok(!noChannel.calls.some((x) => x[0] === 'write'), 'no AI call when there is no channel to draft on');

  await assert.rejects(setup({ rows: [ideaRow({ status: 'PLANNED', briefId: 'b1' })] }).svc.plan('o', 'u1', 'USER', 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: false }), BadRequestException);
  await assert.rejects(setup({ rows: [ideaRow({ brandIds: ['zz'] })] }).svc.plan('o', 'u1', 'USER', 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: false }), BadRequestException);
  await assert.rejects(setup({ role: 'view' }).svc.plan('o', 'u1', 'USER', 'i1', { customerId: 'acc', date: FUTURE, format: 'Text', ai: false }), ForbiddenException);
});
