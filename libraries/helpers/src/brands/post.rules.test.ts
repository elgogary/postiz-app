import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Card, actionsFor, approvalBlock, blockOf, briefsFromPlan, buildCards, calendarWeeks, contentMix, datePassed, dueSoon,
  inferFormat, localDay, localToUtc, matchPosts, mediaMissing, planWindow, stateOf, textOf, whereItStands,
} from './post.rules';

const NOW = new Date('2026-11-26T10:00:00Z');
const card = (over: Partial<Card>): Card => ({
  key: 'k', briefId: 'b', postId: 'p', group: 'g', date: '2026-11-28T07:30:00.000Z', state: 'draft', format: 'Text',
  goal: '', pillars: [], title: 'T', sub: '', caption: '', slidesLabel: '', slides: [], visual: '', imagePrompt: '',
  why: '', verify: '', firstDraft: false, media: [], channel: 'C', sentBy: null, decidedBy: null, comments: 0,
  lastNote: null, ...over,
});

test('card state comes from the post and the brief', () => {
  assert.equal(stateOf(false, null, 'NONE'), 'planned');
  assert.equal(stateOf(true, 'DRAFT', 'NONE'), 'draft');
  assert.equal(stateOf(true, 'DRAFT', 'IN_REVIEW'), 'review');
  assert.equal(stateOf(true, 'DRAFT', 'SENT_BACK'), 'changes');
  assert.equal(stateOf(true, 'QUEUE', 'APPROVED'), 'scheduled');
  assert.equal(stateOf(true, 'PUBLISHED', 'NONE'), 'published');
  assert.equal(stateOf(true, 'ERROR', 'APPROVED'), 'error');
});

test('media rules per format', () => {
  const img = { path: 'https://x/a.png' }, vid = { path: 'https://x/v.MP4' };
  assert.equal(inferFormat([]), 'Text');
  assert.equal(inferFormat([img]), 'Image');
  assert.equal(inferFormat([img, img]), 'Carousel');
  assert.equal(inferFormat([vid]), 'Video');
  assert.equal(mediaMissing('Carousel', [img]), true);
  assert.equal(mediaMissing('Carousel', [img, img]), false);
  assert.equal(mediaMissing('Carousel', [img, vid]), true);
  assert.equal(mediaMissing('Video', [img]), true);
  assert.equal(mediaMissing('Video', [vid]), false);
  assert.equal(mediaMissing('Image', []), true);
  assert.equal(mediaMissing('Text', []), false);
  assert.equal(mediaMissing('Poll', []), false);
});

test('date passed and due soon', () => {
  assert.equal(datePassed(card({ date: '2026-11-26T09:59:00Z' }), NOW), true);
  assert.equal(datePassed(card({ date: '2026-11-26T09:59:00Z', state: 'scheduled' }), NOW), false);
  assert.equal(datePassed(card({ date: '2026-11-26T09:59:00Z', state: 'planned' }), NOW), true);
  assert.equal(dueSoon(card({ state: 'review', date: '2026-11-27T12:00:00Z' }), NOW), true);
  assert.equal(dueSoon(card({ state: 'review', date: '2026-11-28T12:00:00Z' }), NOW), false);
  assert.equal(dueSoon(card({ state: 'draft', date: '2026-11-27T12:00:00Z' }), NOW), false);
});

test('actions per role and approval setting', () => {
  assert.deepEqual(actionsFor('view', true, card({ state: 'review' }), NOW), []);
  assert.deepEqual(actionsFor('create', true, card({ state: 'draft' }), NOW), ['sendForReview']);
  assert.deepEqual(actionsFor('create', false, card({ state: 'draft' }), NOW), ['schedule']);
  assert.deepEqual(actionsFor('create', true, card({ state: 'planned', postId: null }), NOW), ['createDraft']);
  assert.deepEqual(actionsFor('create', true, card({ state: 'review' }), NOW), []);
  assert.deepEqual(actionsFor('approve', true, card({ state: 'review' }), NOW), ['approve', 'sendBack', 'stop']);
  assert.deepEqual(actionsFor('approve', true, card({ state: 'scheduled' }), NOW), ['stop']);
  assert.deepEqual(actionsFor('approve', true, card({ state: 'error' }), NOW), ['stop']);
  assert.deepEqual(actionsFor('create', true, card({ state: 'error' }), NOW), []);
  assert.deepEqual(actionsFor('create', true, card({ state: 'changes', date: '2026-11-20T09:00:00Z' }), NOW), ['newDate', 'sendForReview']);
  assert.deepEqual(actionsFor('approve', true, card({ state: 'draft', format: 'Poll' }), NOW), ['sendForReview', 'markPublished']);
});

test('locks: media, date, ticks', () => {
  const carousel = card({ format: 'Carousel', media: [{ path: 'a.png' }] });
  assert.equal(blockOf('sendForReview', carousel, NOW), 'media');
  assert.equal(blockOf('schedule', carousel, NOW), 'media');
  const review = card({ state: 'review', verify: 'Check the numbers' });
  assert.equal(blockOf('approve', review, NOW), 'ticks');
  assert.equal(blockOf('approve', review, NOW, { own: true, list: false }), 'ticks');
  assert.equal(blockOf('approve', review, NOW, { own: true, list: true }), '');
  assert.equal(blockOf('approve', card({ state: 'review' }), NOW, { own: false, list: true }), '');
  assert.equal(blockOf('approve', card({ state: 'review', date: '2026-11-25T09:00:00Z' }), NOW, { own: true, list: true }), 'date');
});

test('text of a Postiz post body', () => {
  assert.equal(textOf('<p>One &amp; two</p><p>Line<br>three</p>'), 'One & two\nLine\nthree');
});

test('cards: brief with post, planned brief, post without brief; sorted by state then date', () => {
  const brief = (id: string, postId: string | null, plannedAt: string) => ({
    id, postId, plannedAt, format: 'Carousel' as const, goal: 'Awareness', pillars: ['Ops'], title: `T${id}`, sub: '',
    caption: '', slidesLabel: 'Slides', slides: ['a', 'b'], visual: '', imagePrompt: '', why: '', verify: '',
    firstDraft: false, review: 'IN_REVIEW' as const, sentById: 'u1', decidedById: null,
  });
  const cards = buildCards(
    [brief('1', 'p1', '2026-11-27T07:30:00.000Z'), brief('2', null, '2026-11-29T07:30:00.000Z')],
    [
      { id: 'p1', group: 'g1', publishDate: '2026-11-27T08:00:00.000Z', state: 'DRAFT' as const, content: '<p>Hi</p>', image: [{ path: 'a.png' }, { path: 'b.png' }], channel: 'Main', comments: 2, lastNote: null },
      { id: 'p9', group: 'g9', publishDate: '2026-11-28T08:00:00.000Z', state: 'QUEUE' as const, content: '<p>Loose post</p>', image: [], channel: 'Main', comments: 0, lastNote: null },
    ],
    { u1: 'Loay' },
  );
  assert.deepEqual(cards.map((c) => [c.key, c.state]), [['b:1', 'review'], ['b:2', 'planned'], ['p:p9', 'scheduled']]);
  assert.equal(cards[0].caption, 'Hi');
  assert.equal(cards[0].sentBy, 'Loay');
  assert.equal(cards[0].date, '2026-11-27T08:00:00.000Z');
  assert.equal(cards[2].title, 'Loose post');
  assert.equal(cards[2].format, 'Text');
});

test('where it stands', () => {
  const s = whereItStands([
    card({ state: 'published' }), card({ state: 'scheduled', date: '2026-11-30T07:30:00Z' }),
    card({ state: 'scheduled', date: '2026-11-29T07:30:00Z' }),
    card({ state: 'review', date: '2026-11-25T07:30:00Z' }), card({ state: 'review', date: '2026-11-27T07:30:00Z' }),
    card({ state: 'changes', sentBy: 'Loay' }), card({ state: 'changes', sentBy: 'Loay' }),
    card({ state: 'draft', format: 'Video' }), card({ state: 'planned', postId: null, date: '2026-11-20T07:30:00Z' }),
  ], NOW);
  assert.equal(s.total, 9);
  assert.deepEqual([s.published, s.scheduled, s.review, s.changes, s.draft, s.planned], [1, 2, 2, 2, 1, 1]);
  assert.equal(s.nextScheduled, '2026-11-29T07:30:00Z');
  assert.deepEqual([s.reviewDatePassed, s.reviewDueSoon, s.draftsMissingMedia, s.plannedDatePassed], [1, 1, 1, 1]);
  assert.deepEqual(s.waitingOn, ['Loay']);
});

test('content mix tallies goal, format and pillar, largest first', () => {
  const m = contentMix([
    card({ goal: 'Awareness', format: 'Carousel', pillars: ['Ops', 'AI'] }),
    card({ goal: 'Awareness', format: 'Text', pillars: ['Ops'] }),
    card({ goal: '', format: 'Text', pillars: [] }),
  ]);
  assert.deepEqual(m.byGoal, [['Awareness', 2]]);
  assert.deepEqual(m.byFormat, [['Text', 2], ['Carousel', 1]]);
  assert.deepEqual(m.byPillar, [['Ops', 2], ['AI', 1]]);
});

test('plan window and calendar weeks', () => {
  assert.deepEqual(planWindow([['2026-11-15', '2026-11-21'], ['2026-12-06', '2026-12-14']], NOW), { from: '2026-11-15', to: '2026-12-14' });
  assert.deepEqual(planWindow(null, NOW), { from: '2026-11-01', to: '2026-11-30' });
  const weeks = calendarWeeks('2026-11-15', '2026-11-26');
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0][0], '2026-11-15');
  assert.equal(weeks[1][6], '2026-11-28');
});

test('local 09:30 to UTC and back to the local day', () => {
  assert.equal(localToUtc('2026-11-27', '09:30', -120), '2026-11-27T07:30:00.000Z');
  assert.equal(localDay('2026-11-26T23:30:00.000Z', -120), '2026-11-27');
});

test('plan posts become briefs; dates match one free post on the same day only', () => {
  const posts = [
    { n: 1, date: '2026-11-15', week: 1, fmt: 'Carousel', goal: 'aw', pillar: 'Ops', pillars: ['Ops'], title: 'T1', sub: 'S', sl: 'Slides', slides: ['a'], cap: 'c', cta: 'w', vis: 'v', prompt: 'p', verify: 'x' },
    { n: 2, date: '2026-11-18', week: 1, fmt: 'Reel', goal: 'zz', pillar: 'AI', pillars: ['AI'], title: 'T2', sub: '', sl: '', slides: [], cap: '', cta: '', vis: '', prompt: '', verify: '' },
  ];
  const briefs = briefsFromPlan(posts, { aw: 'Awareness' }, -120);
  assert.equal(briefs[0].planRef, '2026-11-15#1');
  assert.equal(briefs[0].plannedAt, '2026-11-15T07:30:00.000Z');
  assert.equal(briefs[0].goal, 'Awareness');
  assert.equal(briefs[0].why, 'w');
  assert.equal(briefs[1].format, 'Text');
  assert.equal(briefs[1].goal, 'zz');
  const match = matchPosts(briefs, [
    { id: 'a', publishDate: '2026-11-15T10:00:00.000Z' },
    { id: 'b', publishDate: '2026-11-18T08:00:00.000Z' }, { id: 'c', publishDate: '2026-11-18T12:00:00.000Z' },
  ], new Set(), -120);
  assert.deepEqual(match, { '2026-11-15#1': 'a' });
  assert.deepEqual(matchPosts(briefs, [{ id: 'a', publishDate: '2026-11-15T10:00:00.000Z' }], new Set(['a']), -120), {});
});

test('approval block names the first brand whose posts need approval', () => {
  const ch = [{ customerId: 'm', name: 'Moon' }, { customerId: 'a', name: 'Acme' }];
  assert.equal(approvalBlock(ch, []), 'Moon');
  assert.equal(approvalBlock(ch, [{ customerId: 'm', requiresApproval: false }]), 'Acme');
  assert.equal(approvalBlock(ch, [{ customerId: 'm', requiresApproval: false }, { customerId: 'a', requiresApproval: false }]), null);
  assert.equal(approvalBlock([], []), null);
});
