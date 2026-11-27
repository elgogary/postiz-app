// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/brands/brand.review.service.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BrandReviewService } from './brand.review.service';

const FUTURE = new Date(Date.now() + 5 * 86400000);
const PAST = new Date(Date.now() - 86400000);

function setup(opts: {
  role?: 'view' | 'create' | 'approve'; approval?: boolean; state?: string; image?: unknown[]; date?: Date;
  brief?: Record<string, unknown> | null; postFound?: boolean;
}) {
  const calls: unknown[][] = [];
  const brief = opts.brief === null ? null : {
    id: 'b1', postId: 'p1', plannedAt: FUTURE, format: 'Text', goal: '', pillars: [], title: 'T', sub: '', caption: 'Hello',
    slidesLabel: '', slides: [], visual: '', imagePrompt: '', why: '', verify: '', firstDraft: false, review: 'NONE',
    sentById: null, decidedById: null, slideComments: {}, ...(opts.brief || {}),
  };
  const brands = {
    context: async () => ({
      customer: { id: 'c1' }, role: opts.role || 'approve', requiresApproval: opts.approval ?? true,
      channels: [{ id: 'i1', name: 'Main', customerId: 'c1' }], focusRows: [], checks: 3,
    }),
  };
  const repo = {
    post: async () => (opts.postFound === false ? null : {
      id: 'p1', group: 'g1', publishDate: opts.date || FUTURE, state: opts.state || 'DRAFT', content: '<p>Hello</p>',
      image: JSON.stringify(opts.image || []), integrationId: 'i1',
    }),
    briefForPost: async () => brief,
    brief: async () => brief,
    updateBrief: async (id: string, data: unknown) => { calls.push(['updateBrief', id, data]); return {}; },
    createBrief: async (data: unknown) => { calls.push(['createBrief', data]); return { id: 'b2' }; },
    addComment: async (o: string, p: string, u: string, text: string) => { calls.push(['addComment', p, u, text]); return { id: 'cm1' }; },
    comments: async () => [{ id: 'cm1', content: 'Fix slide 2', userId: 'u2', createdAt: new Date() }],
    names: async () => ({ u2: 'Owner' }),
    deleteBrief: async (id: string) => { calls.push(['deleteBrief', id]); return {}; },
  };
  const posts = {
    changePostStatus: async (...a: unknown[]) => { calls.push(['changePostStatus', ...a]); return {}; },
    changeDate: async (...a: unknown[]) => { calls.push(['changeDate', ...a]); return {}; },
    changeState: async (...a: unknown[]) => { calls.push(['changeState', ...a]); return {}; },
    mapTypeToPost: async (body: unknown) => body,
    createPost: async () => [{ postId: 'pNew', integration: 'i1' }],
    deletePost: async (...a: unknown[]) => { calls.push(['deletePost', ...a]); return {}; },
  };
  const ideas = { release: async (...a: unknown[]) => { calls.push(['release', ...a]); return true; } };
  return { svc: new BrandReviewService(brands as never, repo as never, posts as never, ideas as never), calls };
}

const args = ['o', 'u1', 'USER', 'c1'] as const;

test('a viewer cannot send for review; a post of another brand is not found', async () => {
  await assert.rejects(setup({ role: 'view' }).svc.sendForReview(...args, 'p1'), ForbiddenException);
  await assert.rejects(setup({ postFound: false }).svc.sendForReview(...args, 'p1'), NotFoundException);
});

test('send for review is locked while a carousel has fewer than two images', async () => {
  const { svc } = setup({ role: 'create', brief: { format: 'Carousel' }, image: [{ path: 'a.png' }] });
  await assert.rejects(svc.sendForReview(...args, 'p1'), (e) => e instanceof BadRequestException && /carousel/i.test(e.message));
  const ok = setup({ role: 'create', brief: { format: 'Carousel' }, image: [{ path: 'a.png' }, { path: 'b.png' }] });
  await ok.svc.sendForReview(...args, 'p1');
  assert.equal((ok.calls[0][2] as { review: string }).review, 'IN_REVIEW');
});

test('approve needs both ticks and a future date, then schedules through Postiz with approvedByReview', async () => {
  const pending = { review: 'IN_REVIEW', verify: 'Check the numbers' };
  await assert.rejects(setup({ brief: pending }).svc.approve(...args, 'p1', { own: true, list: false }), /Tick both/);
  await assert.rejects(setup({ brief: pending, date: PAST }).svc.approve(...args, 'p1', { own: true, list: true }), /new date/);
  await assert.rejects(setup({ role: 'create', brief: pending }).svc.approve(...args, 'p1', { own: true, list: true }), ForbiddenException);
  const { svc, calls } = setup({ brief: pending });
  await svc.approve(...args, 'p1', { own: true, list: true });
  assert.deepEqual(calls[0], ['changePostStatus', 'o', 'p1', 'schedule', true]);
  assert.equal((calls[1][2] as { review: string }).review, 'APPROVED');
});

test('send back writes the reason as a comment; stop returns a scheduled post to draft', async () => {
  const back = setup({ brief: { review: 'IN_REVIEW' } });
  await back.svc.sendBack(...args, 'p1', { reason: 'Shorter hook' });
  assert.deepEqual(back.calls[0], ['addComment', 'p1', 'u1', 'Shorter hook']);
  assert.equal((back.calls[1][2] as { review: string }).review, 'SENT_BACK');
  const stop = setup({ state: 'QUEUE', brief: { review: 'APPROVED' } });
  await stop.svc.stop(...args, 'p1');
  assert.deepEqual(stop.calls[0], ['changePostStatus', 'o', 'p1', 'draft']);
  assert.equal((stop.calls[1][2] as { review: string }).review, 'NONE');
  const failed = setup({ state: 'ERROR', brief: { review: 'APPROVED' } });
  await failed.svc.stop(...args, 'p1');
  assert.deepEqual(failed.calls[0], ['changePostStatus', 'o', 'p1', 'draft']);
  assert.equal((failed.calls[1][2] as { review: string }).review, 'NONE');
});

test('schedule directly only when the brand has no approval step', async () => {
  await assert.rejects(setup({ role: 'create' }).svc.schedule(...args, 'p1'), BadRequestException);
  const { svc, calls } = setup({ role: 'create', approval: false });
  await svc.schedule(...args, 'p1');
  assert.deepEqual(calls[0], ['changePostStatus', 'o', 'p1', 'schedule', true]);
});

test('create draft links the new Postiz post to the planned brief', async () => {
  const { svc, calls } = setup({ role: 'create', brief: { postId: null } });
  const res = await svc.createDraft(...args, 'b1', { date: FUTURE.toISOString() });
  assert.equal(res.postId, 'pNew');
  assert.deepEqual(calls.at(-1), ['updateBrief', 'b1', {
    postId: 'pNew', review: 'NONE', sentById: null, sentAt: null, decidedById: null, decidedAt: null, ownCheckedBy: null, listCheckedBy: null,
  }]);
});

test('a comment on a slide is pinned in the brief; a viewer cannot comment', async () => {
  const { svc, calls } = setup({ role: 'create' });
  await svc.addComment(...args, 'p1', { content: 'Bigger title', slide: 2 });
  assert.deepEqual(calls[1], ['updateBrief', 'b1', { slideComments: { cm1: 2 } }]);
  await assert.rejects(setup({ role: 'view' }).svc.addComment(...args, 'p1', { content: 'x' }), ForbiddenException);
  const list = await setup({ brief: { slideComments: { cm1: 2 } } }).svc.comments(...args, 'p1');
  assert.deepEqual(list.map((c) => [c.by, c.text, c.slide]), [['Owner', 'Fix slide 2', 2]]);
});

test('a new date must be in the future and only for a post not yet scheduled', async () => {
  await assert.rejects(setup({ role: 'create' }).svc.newDate(...args, 'p1', { date: PAST.toISOString() }), /future/);
  await assert.rejects(setup({ role: 'create', state: 'QUEUE' }).svc.newDate(...args, 'p1', { date: FUTURE.toISOString() }), BadRequestException);
  const { svc, calls } = setup({ role: 'create' });
  await svc.newDate(...args, 'p1', { date: FUTURE.toISOString() });
  assert.deepEqual(calls[0], ['changeDate', 'o', 'p1', FUTURE.toISOString(), 'update']);
});

test('a published poll is not marked published again', async () => {
  const { svc } = setup({ role: 'approve', state: 'PUBLISHED', brief: { format: 'Poll' } });
  await assert.rejects(svc.markPublished(...args, 'p1'), (e) => e instanceof BadRequestException && /already published/.test(e.message));
});

test('un-plan deletes the draft, releases the idea and deletes the brief, last', async () => {
  const { svc, calls } = setup({ role: 'create', brief: { ideaId: 'i9' } });
  assert.deepEqual(await svc.unplan(...args, 'b1'), { ok: true });
  assert.deepEqual(calls, [['deletePost', 'o', 'g1'], ['release', 'o', 'i9', 'b1'], ['deleteBrief', 'b1']]);
});

test('un-plan of a planned post with no draft only releases the idea and deletes the brief', async () => {
  const { svc, calls } = setup({ role: 'approve', brief: { ideaId: 'i9', postId: null } });
  await svc.unplan(...args, 'b1');
  assert.deepEqual(calls, [['release', 'o', 'i9', 'b1'], ['deleteBrief', 'b1']]);
});

test('un-plan is refused: viewer, plan-imported brief, sent for review, scheduled post, unknown brief', async () => {
  await assert.rejects(setup({ role: 'view', brief: { ideaId: 'i9' } }).svc.unplan(...args, 'b1'), ForbiddenException);
  await assert.rejects(setup({ role: 'create', brief: { ideaId: null, planRef: '2026#1' } }).svc.unplan(...args, 'b1'), (e) => e instanceof BadRequestException && /idea/.test(e.message));
  for (const review of ['IN_REVIEW', 'SENT_BACK', 'APPROVED']) {
    const s = setup({ role: 'create', brief: { ideaId: 'i9', review } });
    await assert.rejects(s.svc.unplan(...args, 'b1'), (e) => e instanceof BadRequestException && /review/.test(e.message));
    assert.deepEqual(s.calls, []);
  }
  await assert.rejects(setup({ role: 'create', state: 'QUEUE', brief: { ideaId: 'i9' } }).svc.unplan(...args, 'b1'), BadRequestException);
  await assert.rejects(setup({ role: 'create', brief: null }).svc.unplan(...args, 'b1'), NotFoundException);
});
