import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeIdeaText, draftPrompt, ideaView, mapTagsToBrands, parseDraft, parseIdeaText, pillarsFor, topicFromTags,
} from './idea.rules';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'i1', idea: 'Hook: A clear hook\nAngle: Why it matters\nBullets:\n- one\n- two', note: null, source: null, tags: [],
  createdAt: '2026-11-20T10:00:00.000Z', hook: '', angle: '', bullets: [], brandIds: [], topic: '', pillars: [],
  format: '', status: 'NEW', briefId: null, ...over,
});

test('old free text splits into hook, angle and bullets; unstructured text falls back to the first sentence', () => {
  assert.deepEqual(parseIdeaText('Hook: A clear hook\nAngle: Why it matters\nBullets:\n- one\n• two\n▪️ three'),
    { hook: 'A clear hook', angle: 'Why it matters', bullets: ['one', 'two', 'three'], split: true });
  const loose = parseIdeaText('Teams copy data by hand. A system removes the copying.');
  assert.equal(loose.hook, 'Teams copy data by hand.');
  assert.equal(loose.angle, 'A system removes the copying.');
  assert.equal(loose.split, false);
  assert.equal(parseIdeaText('x'.repeat(300)).hook.length, 160);
  assert.deepEqual(parseIdeaText('Hook: H\r\nAngle: A\r\nBullets:\r\n- a\r\n- b'), { hook: 'H', angle: 'A', bullets: ['a', 'b'], split: true });
  assert.deepEqual(parseIdeaText('Hook: H\nAngle: A\nBullets: - inline'), { hook: 'H', angle: 'A', bullets: ['inline'], split: true });
  assert.equal(parseIdeaText('Hook: H only').hook, 'H only');
  assert.equal(parseIdeaText('Intro text\nHook: H\nAngle: A').split, false);
  const started = Date.now();
  parseIdeaText('Hook: ' + '\n '.repeat(5000) + 'x');
  parseIdeaText('Hook: H\nAngle: ' + '\n '.repeat(5000));
  assert.ok(Date.now() - started < 500, 'long blank runs parse at once');
});

test('fields compose back into the old text form', () => {
  const text = composeIdeaText({ hook: 'H', angle: 'A', bullets: ['b1', 'b2'] });
  assert.equal(text, 'Hook: H\nAngle: A\nBullets:\n- b1\n- b2');
  assert.deepEqual(parseIdeaText(text).bullets, ['b1', 'b2']);
  assert.deepEqual(parseIdeaText(composeIdeaText({ hook: 'H', angle: 'A', bullets: [] })), { hook: 'H', angle: 'A', bullets: [], split: true });
});

test('tags map to brands by name or by the map sent in the request; short or unknown tags are ignored', () => {
  const brands = [{ id: 'acc', name: 'Acme Systems' }, { id: 'opt', name: 'Optima Solutions' }, { id: 'own', name: 'Jane Doe' }];
  assert.deepEqual(mapTagsToBrands(['Acme', 'optima', 'Process & control design', 'ai'], brands), ['acc', 'opt']);
  assert.deepEqual(mapTagsToBrands(['JDCo'], brands, { jdco: 'own' }), ['own']);
  assert.deepEqual(mapTagsToBrands([], brands), []);
  assert.deepEqual(mapTagsToBrands(['ab'], brands, { ab: 'own' }), ['own']);
  assert.deepEqual(mapTagsToBrands(['JDCo'], brands, { jdco: 'nope' }), []);
  const acme = [{ id: '1', name: 'Acme Systems' }, { id: '2', name: 'Acme' }];
  assert.deepEqual(mapTagsToBrands(['acme'], acme), ['2']);
});

test('topic comes from the first topic tag, else AI, else General', () => {
  assert.equal(topicFromTags(['Acme', 'Pricing & costing logic']), 'Pricing & costing logic');
  assert.equal(topicFromTags(['prompt-engineering']), 'AI');
  assert.equal(topicFromTags(['Acme']), 'General');
});

test('idea view: fields from the columns or the old text; status from actions and the linked post', () => {
  const old = ideaView(row() as never, null);
  assert.equal(old.hook, 'A clear hook');
  assert.deepEqual(old.bullets, ['one', 'two']);
  assert.equal(old.topic, 'General');
  assert.equal(old.status, 'NEW');
  const filled = ideaView(row({ hook: 'New hook', angle: 'New angle', bullets: ['x'], topic: 'AI', format: 'Carousel', status: 'PLANNED', briefId: 'b1' }) as never,
    { brandId: 'acc', date: '2026-12-01T07:30:00.000Z', postId: 'p1', postState: 'DRAFT' });
  assert.equal(filled.hook, 'New hook');
  assert.equal(filled.format, 'Carousel');
  assert.equal(filled.status, 'PLANNED');
  assert.equal(filled.plannedFor?.brandId, 'acc');
  assert.equal(ideaView(row({ status: 'PLANNED', briefId: 'b1' }) as never, { brandId: 'acc', date: '2026-12-01T07:30:00.000Z', postId: 'p1', postState: 'PUBLISHED' }).status, 'POSTED');
  assert.equal(ideaView(row({ status: 'DROPPED' }) as never, null).status, 'DROPPED');
  assert.equal(ideaView(row({ format: 'Reel' }) as never, null).format, '');
});

test('pillar options are the union of the ticked brands\' Pillars rows', () => {
  assert.deepEqual(pillarsFor(['a', 'b'], { a: ['Ops', 'AI'], b: ['AI', 'Data'], c: ['Other'] }), ['Ops', 'AI', 'Data']);
  assert.deepEqual(pillarsFor([], { a: ['Ops'] }), []);
});

test('the AI prompt carries the voice rules, the checks, the idea and the format; the answer is parsed safely', () => {
  const p = draftPrompt({ brand: 'Acme', voice: 'Short sentences.', checks: ['No client names'], format: 'Carousel',
    idea: { hook: 'H', angle: 'A', bullets: ['b'], brandIds: [], topic: 'AI', pillars: ['Ops'], format: '', source: '' } });
  assert.match(p.system, /Short sentences\./);
  assert.match(p.system, /No client names/);
  assert.match(p.system, /JSON/);
  assert.match(p.user, /Carousel/);
  assert.match(p.user, /H/);
  assert.deepEqual(parseDraft('Here it is: {"caption":"Cap","slidesLabel":"Slides","slides":["s1","s2"]} thanks'),
    { caption: 'Cap', slidesLabel: 'Slides', slides: ['s1', 's2'] });
  assert.equal(parseDraft('no json here'), null);
  assert.equal(parseDraft('{"caption":""}'), null);
  assert.deepEqual(parseDraft('{"caption":"C","slides":["a", 3, "b"]}'), { caption: 'C', slidesLabel: '', slides: ['a', 'b'] });
});
