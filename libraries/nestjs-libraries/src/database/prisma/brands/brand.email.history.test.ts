// Run like brand.email.service.test.ts (see .superpowers/sdd/email-task-1-report.md)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { BrandEmailService } from './brand.email.service';
import { clearRelayCache } from './brand.email.engine';
import { clearLoadCache } from './brand.email.load';

const LM = 'https://lm.acme.test';
const DAY = 86400000;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const lmAt = new Date(Date.now() - 3 * DAY).toISOString();
const sentDate = '2026-03-10T09:00:00.000Z';

class Svc extends BrandEmailService {
  protected login(raw: string | null) { return JSON.parse(raw as string); }
}

const realFetch = globalThis.fetch;
let calls: string[] = [];
let handler: (url: string) => Response;
let store: Record<string, any>[] = [];

function setup(channels = true) {
  const brands = { context: async () => ({ customer: { id: 'acc', name: 'Acme' }, role: 'approve', channels: [] }) };
  const repo = {
    emailChannels: async () => (channels ? [{ id: 'ch1', name: 'Acme email', customInstanceDetails: JSON.stringify({ url: LM, username: 'b', password: 'p' }) }] : []),
    postsByRelease: async () => [], briefsByPost: async () => [], userNames: async () => new Map(),
    history: async (o: string, c: string) => store.filter((h) => h.orgId === o && h.customerId === c).sort((a, b) => +b.sentAt - +a.sentAt),
    historyOne: async (o: string, c: string, id: string) => store.find((h) => h.orgId === o && h.customerId === c && h.sourceId === id) || null,
    saveHistory: async (o: string, c: string, by: string, h: Record<string, any>) => {
      const i = store.findIndex((x) => x.orgId === o && x.sourceId === h.sourceId);
      const row = { ...h, orgId: o, customerId: c, importedById: by };
      if (i >= 0) store[i] = row; else store.push(row);
    },
  };
  return new Svc(brands as never, repo as never);
}

const admin = ['org', 'u-1', 'ADMIN', 'acc'] as const;
const user = ['org', 'u-2', 'USER', 'acc'] as const;

const brevoCampaign = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `Spring offer ${id}`, subject: 'Hello', sender: { email: 'hello@acme.test' }, sentDate, status: 'sent', recipients: { lists: [5, 7, 8] },
  htmlContent: '<p>مرحبا</p>',
  statistics: { globalStats: { sent: 200, delivered: 180, hardBounces: 6, softBounces: 4, uniqueViews: 90, appleMppOpens: 20, uniqueClicks: 5, unsubscriptions: 3 } },
  ...over,
});

function remote(over: Record<number, Record<string, unknown>> = {}) {
  return (url: string) => {
    const u = new URL(url);
    if (u.host === 'api.brevo.com') {
      const m = /^\/v3\/emailCampaigns\/(\d+)$/.exec(u.pathname);
      if (m) {
        const c = brevoCampaign(+m[1], over[+m[1]]);
        if (+m[1] === 404) return json({}, 404);
        return u.searchParams.get('statistics') === 'linksStats'
          ? json({ id: c.id, statistics: { linksStats: { 'https://acme.test/a': 2, 'https://acme.test/b': 6 } } })
          : json(c);
      }
      const l = /^\/v3\/contacts\/lists\/(\d+)$/.exec(u.pathname);
      if (l) return json({ name: `Brevo list ${l[1]}` });
    }
    if (u.pathname === '/api/lists') return json({ data: { results: [{ id: 21, name: 'Acme old', tags: ['from-brevo'], subscriber_count: 3, subscriber_statuses: {} }] } });
    if (u.pathname === '/api/campaigns') return json({ data: { results: [] } });
    return json({}, 404);
  };
}

beforeEach(() => {
  calls = []; store = [];
  clearRelayCache(); clearLoadCache();
  process.env.BREVO_API_KEY = 'secret-key';
  handler = remote();
  globalThis.fetch = (async (input: string | URL) => { calls.push(String(input)); return handler(String(input)); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.BREVO_API_KEY; });

test('import: org admin only, and nothing is read from Brevo for anyone else', async () => {
  await assert.rejects(setup().importHistory(...user, [6], { 5: 21 }), ForbiddenException);
  assert.equal(calls.length, 0);
  assert.equal(store.length, 0);
});

test('import: stores each campaign as Brevo counts it, maps only lists that are the brand\'s own, and is idempotent', async () => {
  const s = setup();
  const r = await s.importHistory(...admin, [6, 4], { 5: 21, 7: 99 });
  assert.deepEqual(r, { imported: 2, campaigns: [{ id: 6, name: 'Spring offer 6' }, { id: 4, name: 'Spring offer 4' }] });
  const h = store.find((x) => x.sourceId === '6')!;
  assert.deepEqual([h.listIds, h.listNames], [[21], ['Brevo list 5']], 'list 7 maps outside the brand, list 8 is not mapped');
  assert.deepEqual([h.sent, h.delivered, h.hardBounces, h.softBounces, h.opens, h.uncertainOpens, h.clicks, h.unsubscribed], [200, 180, 6, 4, 90, 20, 5, 3]);
  assert.deepEqual(h.links, [{ url: 'https://acme.test/a', clicks: 2 }, { url: 'https://acme.test/b', clicks: 6 }]);
  assert.equal(h.sender, 'hello@acme.test');
  assert.equal(h.html, '<p>مرحبا</p>');
  const key = calls.length;
  assert.ok(calls.filter((u) => u.includes('api.brevo.com')).length >= key - 2);
  await s.importHistory(...admin, [6, 4], { 5: 21 });
  assert.equal(store.length, 2, 'the same campaigns update their rows');
});

test('import: a campaign that was not sent is refused by id and nothing is stored; so is a bad body', async () => {
  handler = remote({ 4: { status: 'draft' } });
  await assert.rejects(setup().importHistory(...admin, [6, 4], { 5: 21 }), (e: Error) => e instanceof BadRequestException && /Campaign 4 was not sent/.test(e.message));
  assert.equal(store.length, 0);
  await assert.rejects(setup().importHistory(...admin, [404], { 5: 21 }), (e: Error) => e instanceof BadRequestException && /404/.test(e.message));
  for (const [ids, map] of [[[], {}], [['x'], {}], [[1], null], [[1], { a: 2 }], [[1], { 5: 'z' }]] as [unknown, unknown][]) {
    await assert.rejects(setup().importHistory(...admin, ids, map), BadRequestException);
  }
});

test('import: a Brevo failure is a 502 that carries no key; without the key the import is refused', async () => {
  const lm = remote();
  handler = (url) => (url.includes('api.brevo.com') ? json({}, 500) : lm(url));
  await assert.rejects(setup().importHistory(...admin, [6], { 5: 21 }), (e: HttpException) => e.getStatus() === 502 && !/secret-key/.test(e.message));
  const sent = calls.find((u) => u.includes('api.brevo.com'));
  assert.ok(sent);
  delete process.env.BREVO_API_KEY;
  await assert.rejects(setup().importHistory(...admin, [6], { 5: 21 }), BadRequestException);
});

test('overview: history rows join the campaigns newest first, count in a list\'s last email, and show without a key or channel', async () => {
  const s = setup();
  await s.importHistory(...admin, [6], { 5: 21 });
  delete process.env.BREVO_API_KEY;
  clearLoadCache();
  const o = await s.overview(...user);
  const row = o.campaigns.find((c) => c.channelId === 'history')!;
  assert.deepEqual([row.id, row.state, row.at, row.sentTo, row.opened, row.clicked, row.unsubscribed],
    [6, 'sent', sentDate, 200, { count: 90, pct: 50 }, { count: 5, pct: 2.78 }, { count: 3, pct: 1.67 }]);
  assert.deepEqual(o.lists.map((l) => [l.id, l.source, l.consent, l.lastEmail]), [[21, 'brevo', 'none', sentDate]]);
  assert.equal(o.relay, null);
  const bare = await setup(false).overview(...user);
  assert.deepEqual([bare.channels, bare.failed, bare.campaigns.length], [[], [], 1]);
});

test('overview: an empty history table changes nothing', async () => {
  const o = await setup().overview(...user);
  assert.deepEqual([o.campaigns.length, o.lists[0].lastEmail], [0, null]);
});

test('report and preview for a history campaign come from the table, for any member, and only for this brand', async () => {
  const s = setup();
  await s.importHistory(...admin, [6], { 5: 21 });
  delete process.env.BREVO_API_KEY;
  calls = [];
  const r = await s.report(...user, 'history', 6);
  assert.deepEqual(r.delivered, { count: 180, pct: 90 });
  assert.deepEqual(r.notDelivered, { hard: 6, soft: 4, blocked: 0 });
  assert.equal(r.uncertainOpens, 20);
  assert.equal(r.from, 'hello@acme.test');
  assert.deepEqual(r.lists, [{ id: 21, name: 'Brevo list 5' }]);
  assert.deepEqual(r.links.map((l) => l.clicks), [6, 2]);
  assert.deepEqual(r.history, [{ step: 'sent_before_hub', by: null, at: sentDate }]);
  assert.deepEqual(await s.preview(...user, 'history', 6), { html: '<p>مرحبا</p>' });
  assert.equal(calls.length, 0, 'nothing is read from Brevo or Listmonk');
  await assert.rejects(s.report(...user, 'history', 99), NotFoundException);
  await assert.rejects(s.preview(...user, 'history', 99), NotFoundException);
  store[0].customerId = 'other';
  await assert.rejects(s.report(...user, 'history', 6), NotFoundException);
});
