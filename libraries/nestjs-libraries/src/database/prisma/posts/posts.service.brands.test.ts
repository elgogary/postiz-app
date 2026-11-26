// >>> SANAD-BRANDS
// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/posts/posts.service.brands.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { PostsService } from './posts.service';

function setup(opts: { state?: string; refuse?: boolean } = {}) {
  const approvals: unknown[][] = [];
  const repo: string[] = [];
  const approval = {
    assertCanQueue: async (...a: unknown[]) => {
      approvals.push(a);
      if (opts.refuse) throw new ForbiddenException('Moon: posts need approval.');
    },
  };
  const postRepository = {
    getPostById: async () => ({ id: 'p1', state: opts.state || 'DRAFT', integrationId: 'i1', integration: { providerIdentifier: 'x' } }),
    changeDate: async () => { repo.push('changeDate'); return {}; },
    changeState: async () => { repo.push('changeState'); },
    createOrUpdatePost: async () => { repo.push('createOrUpdatePost'); return { posts: [] }; },
  };
  const none = {} as never;
  const svc = new PostsService(postRepository as never, { getSocialIntegration: () => undefined } as never, none, none, none, none, none, none, approval as never);
  return { svc, approvals, repo };
}

const body = (type: string) => ({
  type, date: '2030-01-01T10:00:00', tags: [], shortLink: false,
  posts: [{ integration: { id: 'i1' }, group: 'g', settings: {}, value: [{ id: 'root', content: 'a' }, { id: 'kid', content: 'b' }, { content: 'new' }] }],
}) as never;

test('createPost checks every type but draft, and only update keeps a published post exempt', async () => {
  for (const [type, allowPublished] of [['schedule', false], ['now', false], ['update', true]] as const) {
    const { svc, approvals } = setup();
    await svc.createPost('o', body(type), 'WEB' as never);
    assert.deepEqual(approvals, [['o', [{ integrationId: 'i1', postId: 'root' }, { integrationId: 'i1', postId: 'kid' }], { allowPublished }]], type);
  }
});

test('createPost stops before the repository when the brand refuses', async () => {
  const { svc, repo } = setup({ refuse: true });
  await assert.rejects(svc.createPost('o', body('schedule'), 'WEB' as never), ForbiddenException);
  assert.deepEqual(repo, []);
});

test('createPost as a draft never asks', async () => {
  const { svc, approvals } = setup();
  await svc.createPost('o', body('draft'), 'WEB' as never);
  assert.equal(approvals.length, 0);
});

test('changeDate schedule on a failed post is checked as a new queue and stops when refused', async () => {
  const ok = setup({ state: 'ERROR' });
  await ok.svc.changeDate('o', 'p1', '2030-01-01T10:00:00', 'schedule');
  assert.deepEqual(ok.approvals, [['o', [{ integrationId: 'i1' }]]]);
  const no = setup({ state: 'ERROR', refuse: true });
  await assert.rejects(no.svc.changeDate('o', 'p1', '2030-01-01T10:00:00', 'schedule'), ForbiddenException);
  assert.deepEqual(no.repo, []);
});

test('changeDate on a draft or queued post, or with update, is not checked', async () => {
  for (const state of ['DRAFT', 'QUEUE']) {
    const { svc, approvals } = setup({ state });
    await svc.changeDate('o', 'p1', '2030-01-01T10:00:00', 'schedule');
    assert.equal(approvals.length, 0, state);
  }
  const { svc, approvals } = setup({ state: 'ERROR' });
  await svc.changeDate('o', 'p1', '2030-01-01T10:00:00', 'update');
  assert.equal(approvals.length, 0);
});

test('changePostStatus schedule is checked unless approved by review', async () => {
  const a = setup();
  await a.svc.changePostStatus('o', 'p1', 'schedule');
  assert.deepEqual(a.approvals, [['o', [{ integrationId: 'i1', postId: 'p1' }]]]);
  const b = setup();
  await b.svc.changePostStatus('o', 'p1', 'schedule', true);
  assert.equal(b.approvals.length, 0);
});
// <<< SANAD-BRANDS
