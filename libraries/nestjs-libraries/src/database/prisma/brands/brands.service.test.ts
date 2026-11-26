// Service rules with an in-memory repository (no database). Run inside the built image, where node_modules exist:
//   docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brands.service.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BrandsService } from './brands.service';

const ORG = 'org-1';
const BRAND = 'brand-1';
const OTHER_ORG_BRAND = 'brand-2';

type Section = { key: string; content: string | null; rows: string[][] | null; note: string | null; updatedById: string | null; updatedAt: Date };

function fakeRepo(opts: { access?: { customerId: string; role: string }[]; sections?: Partial<Section>[] } = {}) {
  const calls = { saveSection: [] as unknown[][], saveSections: [] as unknown[][], setAccess: [] as unknown[][], setSettings: [] as unknown[][] };
  const repo = {
    calls,
    failWrites: false,
    customers: async (orgId: string) => (orgId === ORG ? [{ id: BRAND, name: 'Brand One' }] : []),
    customer: async (orgId: string, id: string) => (orgId === ORG && id === BRAND ? { id, name: 'Brand One' } : null),
    channels: async () => [],
    settings: async () => [],
    team: async () => [{ role: 'USER', user: { id: 'u-member', name: 'Member', email: 'm@example.com' } }],
    accessForUser: async () => opts.access || [],
    accessForBrand: async () => opts.access || [],
    sections: async () => (opts.sections || []).map((s) => ({ content: null, rows: null, note: null, updatedById: null, updatedAt: new Date(), ...s })),
    saveSection: async (...args: unknown[]) => {
      if (repo.failWrites) throw new Error('database is down');
      calls.saveSection.push(args);
      return {};
    },
    saveSections: async (...args: unknown[]) => {
      if (repo.failWrites) throw new Error('database is down');
      calls.saveSections.push(args);
      return [];
    },
    setAccess: async (...args: unknown[]) => { calls.setAccess.push(args); return {}; },
    setSettings: async (...args: unknown[]) => { calls.setSettings.push(args); return {}; },
  };
  return repo;
}
const fakePosts = { briefs: async () => [], posts: async () => [], briefUpsert: () => ({}), waiting: async () => [] } as never;
const serviceWith = (repo: ReturnType<typeof fakeRepo>) => new BrandsService(repo as any, fakePosts);

const PLAN = '<script>const GOALS={};const WEEKS=[{n:1,range:"1 – 7 نوفمبر",title:"Week",desc:"d"}];'
  + 'const P=[{n:1,date:"2026-11-02",pillar:"Alpha"}];</script>';

test('a brand from another organisation is not found', async () => {
  const svc = serviceWith(fakeRepo());
  await assert.rejects(svc.get('org-other', 'u1', 'ADMIN', BRAND), NotFoundException);
  await assert.rejects(svc.get(ORG, 'u1', 'ADMIN', OTHER_ORG_BRAND), NotFoundException);
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', OTHER_ORG_BRAND, 'voice', { content: '<p>x</p>' }), NotFoundException);
});

test('a viewer cannot save a section; a creator can', async () => {
  const viewer = fakeRepo({ access: [{ customerId: BRAND, role: 'VIEW' }] });
  await assert.rejects(serviceWith(viewer).saveSection(ORG, 'u1', 'USER', BRAND, 'voice', { content: '<p>x</p>' }), ForbiddenException);
  assert.equal(viewer.calls.saveSection.length, 0);
  const creator = fakeRepo({ access: [{ customerId: BRAND, role: 'CREATE' }] });
  await serviceWith(creator).saveSection(ORG, 'u1', 'USER', BRAND, 'voice', { content: '<p>x</p>' });
  assert.equal(creator.calls.saveSection.length, 1);
});

test('a team member who is not an admin cannot read or change access, settings or import', async () => {
  const repo = fakeRepo({ access: [{ customerId: BRAND, role: 'APPROVE' }] });
  const svc = serviceWith(repo);
  await assert.rejects(svc.getAccess(ORG, 'USER', BRAND), ForbiddenException);
  await assert.rejects(svc.setAccess(ORG, 'USER', BRAND, { userId: 'u-member', role: 'APPROVE' }), ForbiddenException);
  await assert.rejects(svc.setSettings(ORG, 'USER', BRAND, { requiresApproval: false }), ForbiddenException);
  await assert.rejects(svc.importPlan(ORG, 'u1', 'USER', BRAND, { html: PLAN, dryRun: false }), ForbiddenException);
  assert.equal(repo.calls.setAccess.length + repo.calls.setSettings.length + repo.calls.saveSections.length, 0);
});

test('a dry-run import writes nothing and lists the sections it would replace', async () => {
  const repo = fakeRepo({ sections: [{ key: 'pillars', rows: [['Old']] }, { key: 'kpi', rows: [] }, { key: 'voice', content: '' }] });
  const res = await serviceWith(repo).importPlan(ORG, 'u1', 'ADMIN', BRAND, { html: PLAN, dryRun: true }) as any;
  assert.equal(res.dryRun, true);
  assert.deepEqual(res.replaces, ['pillars']);
  assert.equal(res.matched, 0);
  assert.deepEqual(Object.keys(res.rows), ['pillars', 'focus']);
  assert.equal(repo.calls.saveSections.length, 0);
  const real = await serviceWith(repo).importPlan(ORG, 'u1', 'ADMIN', BRAND, { html: PLAN, dryRun: false }) as any;
  assert.equal(real.dryRun, false);
  assert.equal(repo.calls.saveSections.length, 1);
});

test('bad rows, an over-long text and a malformed plan are bad requests', async () => {
  const svc = serviceWith(fakeRepo());
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', BRAND, 'kpi', { rows: [['only', 'two']] }), BadRequestException);
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', BRAND, 'focus', { rows: [['2026-11-10', '2026-11-01', 't', 'd']] }), BadRequestException);
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', BRAND, 'voice', { content: 'x'.repeat(100001) }), BadRequestException);
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', BRAND, 'nope', { content: 'x' }), BadRequestException);
  const noPillar = '<script>const GOALS={};const WEEKS=[];const P=[{n:1,date:"2026-11-02"}];</script>';
  await assert.rejects(svc.importPlan(ORG, 'u1', 'ADMIN', BRAND, { html: noPillar, dryRun: true }),
    (e: Error) => e instanceof BadRequestException && /post 1 is missing pillar/.test(e.message));
});

test('a repository write error is not turned into a bad request', async () => {
  const repo = fakeRepo();
  repo.failWrites = true;
  const svc = serviceWith(repo);
  await assert.rejects(svc.saveSection(ORG, 'u1', 'ADMIN', BRAND, 'voice', { content: '<p>x</p>' }),
    (e: Error) => !(e instanceof BadRequestException) && /database is down/.test(e.message));
  await assert.rejects(svc.importPlan(ORG, 'u1', 'ADMIN', BRAND, { html: PLAN, dryRun: false }),
    (e: Error) => !(e instanceof BadRequestException) && /database is down/.test(e.message));
});
