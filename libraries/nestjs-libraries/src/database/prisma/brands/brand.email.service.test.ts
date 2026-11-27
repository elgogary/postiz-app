// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brand.email.service.test.ts"
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BrandEmailService } from './brand.email.service';
import { clearRelayCache } from './brand.email.engine';

const LM = 'https://lm.acme.test';
const LM2 = 'https://lm2.acme.test';
const DAY = 86400000;
const started = new Date(Date.now() - 3 * DAY).toISOString();
const unsubAt = new Date(Date.now() - 2 * DAY).toISOString();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const campaign = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'launch', subject: 'Launch day', status: 'finished', lists: [{ id: 7, name: 'Acme: newsletter' }], created_at: started,
  started_at: started, updated_at: started, send_at: null, sent: 100, views: 40, clicks: 8, from_email: 'Acme <hello@acme.test>', ...over,
});
const list = (over: Record<string, unknown> = {}) => ({
  id: 7, name: 'Acme: newsletter', tags: ['consent-agreed'], subscriber_count: 50, subscriber_statuses: { confirmed: 48, unsubscribed: 2 }, ...over,
});

class Svc extends BrandEmailService {
  protected login(raw: string | null) { return JSON.parse(raw as string); }
}

type Opts = { role?: string; channels?: { id: string; name: string }[]; brief?: Record<string, unknown> | null; post?: boolean };
const realFetch = globalThis.fetch;
let calls: { url: string; init?: RequestInit }[] = [];
let handler: (url: string, init?: RequestInit) => Response | Promise<Response>;

function setup(opts: Opts = {}) {
  const channels = (opts.channels || [{ id: 'ch1', name: 'Acme email' }]).map((c, i) => ({
    ...c, customInstanceDetails: JSON.stringify({ url: i === 0 ? LM : LM2, username: 'brand', password: 'pw' }),
  }));
  const brands = { context: async () => ({ customer: { id: 'acc', name: 'Acme' }, role: opts.role || 'approve', channels: [] }) };
  const repo = {
    emailChannels: async () => channels,
    postsByRelease: async (_o: string, _i: string, urls: string[]) =>
      opts.post ? urls.filter((u) => u.endsWith('/campaigns/1/preview')).map((u) => ({ id: 'p1', releaseURL: u })) : [],
    briefsByPost: async () => (opts.brief ? [{ postId: 'p1', ...opts.brief }] : []),
    userNames: async (ids: string[]) => new Map(ids.map((i) => [i, i === 'u-mona' ? 'Mona' : 'Sam'])),
  };
  const svc = new Svc(brands as never, repo as never);
  svc.pollMs = 1;
  return svc;
}

const args = ['org', 'u-mona', 'USER', 'acc'] as const;

function listmonk(over: { campaigns?: unknown[]; lists?: unknown[]; unsubs?: unknown[]; import?: unknown[] } = {}) {
  const imports = [...(over.import || [])];
  return (url: string) => {
    const u = new URL(url);
    if (u.host === 'api.brevo.com') return json({ requests: 100, delivered: 90, hardBounces: 4, softBounces: 3, blocked: 3, uniqueOpens: 45, uniqueClicks: 9, loadedByProxy: 12 });
    if (u.pathname === '/api/campaigns') return json({ data: { results: over.campaigns || [campaign()] } });
    if (u.pathname === '/api/lists') return json({ data: { results: over.lists || [list()] } });
    if (u.pathname === '/api/subscribers') {
      return json({ data: { total: 2, results: u.searchParams.get('subscription_status') ? (over.unsubs || []) : [
        { email: 'a@acme.test', name: 'Ann', status: 'enabled', lists: [{ id: 7, subscription_status: 'confirmed', subscription_created_at: started }] },
        { email: 'b@acme.test', name: '', status: 'blocklisted', lists: [{ id: 7, subscription_status: 'unconfirmed', subscription_created_at: started }] },
      ] } });
    }
    if (u.pathname === '/api/campaigns/analytics/links') return json({ data: [{ url: 'https://acme.test/a', count: 2 }, { url: 'https://acme.test/b', count: 6 }] });
    if (u.pathname === '/api/import/subscribers') return json({ data: imports.length > 1 ? imports.shift() : imports[0] || { status: 'none' } });
    return json({}, 404);
  };
}

beforeEach(() => {
  calls = [];
  clearRelayCache();
  delete process.env.BREVO_API_KEY;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => { calls.push({ url: String(input), init }); return handler(String(input), init); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; delete process.env.BREVO_API_KEY; });

test('overview: one channel answers, one fails and is named; unsubscribes go to the campaign sent before them', async () => {
  const lm = listmonk({ unsubs: [{ lists: [{ id: 7, subscription_status: 'unsubscribed', subscription_updated_at: unsubAt }] }] });
  handler = (url, init) => { if (url.startsWith(LM2)) throw new Error('down'); return lm(url); };
  const s = setup({ channels: [{ id: 'ch1', name: 'Acme email' }, { id: 'ch2', name: 'Beta email' }] });
  const o = await s.overview(...args);
  assert.deepEqual(o.failed, ['Beta email']);
  assert.equal(o.channels.length, 2);
  assert.equal(o.relay, null);
  assert.equal(o.campaigns.length, 1);
  const c = o.campaigns[0];
  assert.deepEqual([c.state, c.sentTo, c.opened, c.clicked, c.unsubscribed], ['sent', 100, { count: 40, pct: 40 }, { count: 8, pct: 8 }, { count: 1, pct: 1 }]);
  assert.deepEqual(o.lists.map((l) => [l.contacts, l.unsubscribed, l.consent, l.lastEmail]), [[48, 2, 'agreed', started]]);
  assert.ok(calls.every((x) => !x.url.includes('brevo')));
});

test('overview: a draft has no rates and sorts by its update time', async () => {
  handler = listmonk({ campaigns: [campaign({ id: 2, status: 'draft', started_at: null, sent: 0, updated_at: new Date().toISOString() }), campaign()] });
  const o = await setup().overview(...args);
  assert.deepEqual(o.campaigns.map((c) => c.id), [2, 1]);
  assert.deepEqual([o.campaigns[0].state, o.campaigns[0].opened, o.campaigns[0].unsubscribed], ['draft', null, null]);
});

test('overview: the relay report is used when the key and the post exist (rates over delivered)', async () => {
  process.env.BREVO_API_KEY = 'secret-key';
  handler = listmonk({ unsubs: [{ lists: [{ id: 7, subscription_status: 'unsubscribed', subscription_updated_at: unsubAt }] }] });
  const o = await setup({ post: true }).overview(...args);
  assert.equal(o.relay, 'brevo');
  const c = o.campaigns[0];
  assert.deepEqual([c.opened, c.clicked, c.unsubscribed], [{ count: 45, pct: 50 }, { count: 9, pct: 10 }, { count: 1, pct: 1.11 }]);
  const brevo = calls.find((x) => x.url.includes('api.brevo.com'));
  assert.ok(brevo?.url.includes('tag=hub-p1'));
  assert.equal((brevo?.init?.headers as Record<string, string>)['api-key'], 'secret-key');
  await setup({ post: true }).overview(...args);
  assert.equal(calls.filter((x) => x.url.includes('api.brevo.com')).length, 1, 'second read comes from the cache');
});

test('overview: with the key but no post, or a relay failure, the numbers fall back to Listmonk totals', async () => {
  process.env.BREVO_API_KEY = 'secret-key';
  handler = listmonk();
  const none = await setup({ post: false }).overview(...args);
  assert.equal(none.relay, 'brevo');
  assert.deepEqual(none.campaigns[0].opened, { count: 40, pct: 40 });
  clearRelayCache();
  const lm = listmonk();
  handler = (url, init) => (url.includes('api.brevo.com') ? json({}, 500) : lm(url));
  const failed = await setup({ post: true }).overview(...args);
  assert.deepEqual(failed.campaigns[0].opened, { count: 40, pct: 40 });
});

test('report: delivered, not delivered, links by clicks, history shows approved only when the brief says APPROVED', async () => {
  process.env.BREVO_API_KEY = 'secret-key';
  handler = listmonk();
  const sentAt = new Date(Date.now() - 5 * DAY);
  const decidedAt = new Date(Date.now() - 4 * DAY);
  const approved = await setup({ post: true, brief: { review: 'APPROVED', sentById: 'u-sam', sentAt, decidedById: 'u-mona', decidedAt } }).report(...args, 'ch1', 1);
  assert.deepEqual(approved.history.map((h) => [h.step, h.by]), [['sent_for_review', 'Sam'], ['approved', 'Mona'], ['sent', null], ['finished', null]]);
  assert.deepEqual(approved.delivered, { count: 90, pct: 90 });
  assert.deepEqual(approved.notDelivered, { hard: 4, soft: 3, blocked: 3 });
  assert.equal(approved.uncertainOpens, 12);
  assert.deepEqual(approved.links.map((l) => l.clicks), [6, 2]);
  assert.equal(approved.from, 'Acme <hello@acme.test>');
  clearRelayCache();
  const sentBack = await setup({ post: true, brief: { review: 'SENT_BACK', sentById: 'u-sam', sentAt, decidedById: 'u-mona', decidedAt } }).report(...args, 'ch1', 1);
  assert.deepEqual(sentBack.history.map((h) => h.step), ['sent_for_review', 'sent', 'finished']);
  await assert.rejects(setup().report(...args, 'ch1', 99), NotFoundException);
  await assert.rejects(setup().report(...args, 'nope', 1), NotFoundException);
});

test('report without a relay shows no delivered numbers', async () => {
  handler = listmonk();
  const r = await setup().report(...args, 'ch1', 1);
  assert.deepEqual([r.delivered, r.notDelivered, r.uncertainOpens], [null, null, null]);
});

test('contacts and import are for approvers only', async () => {
  handler = listmonk();
  const s = setup({ role: 'create' });
  await assert.rejects(s.contacts(...args, 'ch1', 7, 1), ForbiddenException);
  await assert.rejects(setup({ role: 'view' }).importContacts(...args, 'ch1', 7, { buffer: Buffer.from('a@acme.test') }, true), ForbiddenException);
  assert.equal(calls.length, 0);
  const ok = await setup().contacts(...args, 'ch1', 7, 1);
  assert.deepEqual(ok.contacts.map((c) => c.status), ['subscribed', 'blocklisted']);
  assert.equal(ok.total, 2);
  await assert.rejects(setup().contacts(...args, 'ch1', 99, 1), NotFoundException);
});

test('import needs the agreement tick and a readable file', async () => {
  handler = listmonk();
  const s = setup();
  await assert.rejects(s.importContacts(...args, 'ch1', 7, { buffer: Buffer.from('a@acme.test') }, false), (e: Error) => e instanceof BadRequestException && /agreed to hear from Acme/.test(e.message));
  await assert.rejects(s.importContacts(...args, 'ch1', 7, { buffer: Buffer.from('no addresses here') }, true), BadRequestException);
  await assert.rejects(s.importContacts(...args, 'ch1', 7, undefined, true), BadRequestException);
  assert.equal(calls.length, 0);
});

test('import posts the list and the consent record, then polls until finished', async () => {
  handler = listmonk({ import: [{ status: 'none' }, { status: 'importing' }, { status: 'importing' }, { status: 'finished', imported: 2 }] });
  const file = Buffer.from('email,name\nann@acme.test,Ann\nbob@acme.test,Bob\nann@acme.test,Ann again\n');
  const r = await setup().importContacts(...args, 'ch1', 7, { buffer: file }, true);
  assert.deepEqual(r, { imported: 2, skipped: 1 });
  const post = calls.find((x) => x.init?.method === 'POST')!;
  const form = post.init!.body as FormData;
  assert.deepEqual(JSON.parse(form.get('params') as string), { mode: 'subscribe', subscription_status: 'confirmed', delim: ',', lists: [7], overwrite: false });
  const csv = await (form.get('file') as Blob).text();
  assert.match(csv, /ann@acme\.test/);
  assert.match(csv, /hub-import/);
  assert.match(csv, /Mona/);
});

test('import: refused while another import runs; a failed import is reported', async () => {
  handler = listmonk({ import: [{ status: 'importing' }] });
  await assert.rejects(setup().importContacts(...args, 'ch1', 7, { buffer: Buffer.from('ann@acme.test') }, true), /Another import is running/);
  assert.ok(!calls.some((x) => x.init?.method === 'POST'));
  handler = listmonk({ import: [{ status: 'none' }, { status: 'failed' }] });
  await assert.rejects(setup().importContacts(...args, 'ch1', 7, { buffer: Buffer.from('ann@acme.test') }, true), /import failed in the email engine/);
});
