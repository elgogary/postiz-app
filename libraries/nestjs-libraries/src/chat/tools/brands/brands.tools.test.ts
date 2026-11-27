import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { runWithContext } from '@gitroom/nestjs-libraries/chat/async.storage';
import { NO_PERSON, pickBrand, plain } from './brands.tool.helpers';
import { BrandHubTool, BrandsListTool } from './brands.read.tools';
import { CommentPostTool, DraftFromIdeaTool, ReviewPostTool } from './brands.act.tools';

const ORG = { id: 'org-1' };
const LOUAY = { id: 'u-1', role: 'USER' as const };
const BRANDS = [{ id: 'b-1', name: 'Accurate Systems', role: 'create', requiresApproval: true, waiting: 0, channels: [{ name: 'LinkedIn' }] }];

const calls: unknown[][] = [];
const rec = (name: string, out: unknown = { ok: true }) => async (...args: unknown[]) => { calls.push([name, ...args]); return out; };
const brands = { list: rec('list', BRANDS), get: rec('get', { sections: { voice: { content: '<h3>Tone</h3><p>Plain &amp; warm</p>' } } }) } as any;
const review = {
  cards: rec('cards', { checks: ['own words', 'brand list'], cards: [{ briefId: 'br-9', postId: 'p-9', state: 'draft' }] }),
  sendForReview: rec('sendForReview'), approve: rec('approve'), sendBack: rec('sendBack'), stop: rec('stop'), addComment: rec('addComment', { id: 'c-1' }),
} as any;
const ideas = { plan: rec('plan', { briefId: 'br-9', firstDraft: true, aiFailed: false, noChannel: false }) } as any;

const asPerson = <T>(fn: () => Promise<T>) => runWithContext({ requestId: 't', auth: ORG, user: LOUAY }, fn);
const asApiKey = <T>(fn: () => Promise<T>) => runWithContext({ requestId: 't', auth: ORG }, fn);
const exec = (tool: { run(): any }, input: object) => tool.run().execute(input, {});
const called = (name: string) => calls.filter((c) => c[0] === name);

test('without a person (API key connection) every Brands tool refuses', async () => {
  calls.length = 0;
  const out = await asApiKey(() => exec(new BrandsListTool(brands), {}));
  assert.deepEqual(out, { error: NO_PERSON });
  assert.equal(calls.length, 0);
});

test("brands_list runs as the person: their org, id and role reach the service", async () => {
  calls.length = 0;
  const out = await asPerson(() => exec(new BrandsListTool(brands), {}));
  assert.deepEqual(called('list')[0], ['list', 'org-1', 'u-1', 'USER']);
  assert.equal(out.brands[0].yourRole, 'create');
});

test('brand_hub finds the brand by name in any case and returns the voice as plain text', async () => {
  calls.length = 0;
  const out = await asPerson(() => exec(new BrandHubTool(brands, review), { brand: 'accurate   systems' }));
  assert.equal(out.id, 'b-1');
  assert.equal(out.voice, 'Tone\nPlain & warm');
  assert.deepEqual(out.checksBeforeApproving, ['own words', 'brand list']);
});

test('draft_from_idea plans with the AI draft, then sends the new post for review', async () => {
  calls.length = 0;
  const out = await asPerson(() => exec(new DraftFromIdeaTool(brands, review, ideas), { brand: 'Accurate Systems', ideaId: 'i-1', date: '2026-12-01' }));
  assert.deepEqual(called('plan')[0], ['plan', 'org-1', 'u-1', 'USER', 'i-1', { customerId: 'b-1', date: '2026-12-01', format: 'Text', ai: true }]);
  assert.deepEqual(called('sendForReview')[0], ['sendForReview', 'org-1', 'u-1', 'USER', 'b-1', 'p-9']);
  assert.equal(out.sentForReview, true);
  calls.length = 0;
  await asPerson(() => exec(new DraftFromIdeaTool(brands, review, ideas), { brand: 'b-1', ideaId: 'i-1', date: '2026-12-01', sendForReview: false }));
  assert.equal(called('sendForReview').length, 0);
});

test('review_post: approve needs both checks confirmed; send back needs a reason; stop goes straight through', async () => {
  calls.length = 0;
  const tool = new ReviewPostTool(brands, review);
  assert.match((await asPerson(() => exec(tool, { brand: 'b-1', postId: 'p-9', action: 'approve', confirmedOwnCheck: true }))).error, /both checks/);
  assert.match((await asPerson(() => exec(tool, { brand: 'b-1', postId: 'p-9', action: 'send_back', reason: '  ' }))).error, /reason/);
  assert.equal(called('approve').length + called('sendBack').length, 0);
  await asPerson(() => exec(tool, { brand: 'b-1', postId: 'p-9', action: 'approve', confirmedOwnCheck: true, confirmedListCheck: true }));
  assert.deepEqual(called('approve')[0].slice(5), ['p-9', { own: true, list: true }]);
  await asPerson(() => exec(tool, { brand: 'b-1', postId: 'p-9', action: 'stop' }));
  assert.equal(called('stop').length, 1);
});

test("a service refusal comes back as the person's message; an internal error never shows its text", async () => {
  const approveWith = (fail: () => never) => asPerson(() => exec(new ReviewPostTool(brands, { ...review, approve: async () => fail() }),
    { brand: 'b-1', postId: 'p-9', action: 'approve', confirmedOwnCheck: true, confirmedListCheck: true }));
  assert.deepEqual(await approveWith(() => { throw new ForbiddenException('Only an approver can do this'); }), { error: 'Only an approver can do this' });
  const hidden = await approveWith(() => { throw new Error('relation "PostBrief" column x does not exist'); });
  assert.doesNotMatch(hidden.error, /PostBrief/);
});

test('a draft that was made but could not be sent for review is still reported with its post', async () => {
  const failing = { ...review, sendForReview: async () => { throw new ForbiddenException('Add the media first'); } };
  const out = await asPerson(() => exec(new DraftFromIdeaTool(brands, failing, ideas), { brand: 'b-1', ideaId: 'i-1', date: '2026-12-01' }));
  assert.equal(out.postId, 'p-9');
  assert.equal(out.sentForReview, false);
  assert.match(out.error, /made but not sent for review: Add the media first/);
});

test('comment_post passes the slide it is pinned to', async () => {
  calls.length = 0;
  await asPerson(() => exec(new CommentPostTool(brands, review), { brand: 'b-1', postId: 'p-9', text: 'Shorter title', slide: 2 }));
  assert.deepEqual(called('addComment')[0].slice(5), ['p-9', { content: 'Shorter title', slide: 2 }]);
});

test('helpers: an unknown brand names the ones you have; HTML entities decode once', () => {
  assert.throws(() => pickBrand(BRANDS, 'Moonsab'), /Your brands: Accurate Systems/);
  assert.throws(() => pickBrand([...BRANDS, { ...BRANDS[0], id: 'b-2' }], 'Accurate Systems'), /2 brands are called .*use the id/);
  assert.equal(plain('<p>a &amp;lt; b</p><ul><li>x</li></ul>'), 'a &lt; b\n- x');
});
