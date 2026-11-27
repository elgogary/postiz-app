// Run inside the image: docker run --rm --entrypoint sh <image> -c "cd /app && npx -y tsx@4.19.2 --test libraries/nestjs-libraries/src/database/prisma/posts/posts.hold.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { PostsService } from './posts.service';

function svc(o: { failTerminate?: boolean; held?: boolean } = {}) {
  const calls: unknown[][] = [];
  const handle = { describe: async () => ({ status: { name: 'RUNNING' } }), terminate: async () => {
    calls.push(['terminate']);
    if (o.failTerminate) throw new Error('temporal down');
  } };
  const s = Object.create(PostsService.prototype) as any;
  s._temporalService = { client: {
    getRawClient: () => ({ workflow: { list: () => (async function* () { yield { workflowId: 'w1' }; })() } }),
    getWorkflowHandle: async () => handle,
  } };
  s._brandApproval = {
    assertCanQueue: async () => {},
    editsNeedingReview: async () => (o.held === false ? [] : [{ postId: 'p1', briefId: 'b1' }]),
    putInReview: async (...a: unknown[]) => { calls.push(['putInReview', ...a]); },
  };
  s._postRepository = {
    getPostById: async () => ({ id: 'p1', state: 'QUEUE', integrationId: 'i1', integration: { providerIdentifier: 'x' } }),
    changeDate: async (...a: unknown[]) => { calls.push(['repoChangeDate', ...a]); return {}; },
    createOrUpdatePost: async (...a: unknown[]) => { calls.push(['save', a[0]]); return { posts: [{ id: 'p1', state: 'DRAFT' }] }; },
  };
  s._integrationManager = { getSocialIntegration: () => undefined };
  s._shortLinkService = {};
  s.startWorkflow = async () => { calls.push(['startWorkflow']); };
  return { s: s as PostsService, calls };
}

const body = { type: 'update', date: '2030-01-01T00:00:00', tags: [], shortLink: false,
  posts: [{ integration: { id: 'i1' }, value: [{ id: 'p1', content: 'x', image: [] }], settings: { __type: 'x' } }] } as any;

test('a held post: workflows end first, then the draft is saved, then it goes to review', async () => {
  const { s, calls } = svc();
  await s.createPost('o', body, 'api' as any, { userId: 'u', orgRole: 'USER' } as any);
  assert.deepEqual(calls.map((c) => c[0]), ['terminate', 'save', 'putInReview']);
  assert.deepEqual(calls[1], ['save', 'draft']);
});

test('a held post is not saved when the workflow cannot be ended', async () => {
  const { s, calls } = svc({ failTerminate: true });
  await assert.rejects(s.createPost('o', body, 'api' as any, { userId: 'u', orgRole: 'USER' } as any),
    (e) => e instanceof HttpException && e.getStatus() === 503 && /try again/.test(e.message));
  assert.deepEqual(calls.map((c) => c[0]), ['terminate']);
});

test('changeDate of a held post ends the workflow, then writes DRAFT and the date in one update', async () => {
  const { s, calls } = svc();
  await s.changeDate('o', 'p1', '2030-02-02T00:00:00', 'schedule', { userId: 'u', orgRole: 'USER' } as any);
  assert.deepEqual(calls.map((c) => c[0]), ['terminate', 'repoChangeDate', 'putInReview']);
  assert.deepEqual(calls[1].slice(1, 6), ['o', 'p1', '2030-02-02T00:00:00', true, 'schedule']);
  assert.equal(calls[1][6], true);
});

test('changeDate of a held post is not written when the workflow cannot be ended', async () => {
  const { s, calls } = svc({ failTerminate: true });
  await assert.rejects(s.changeDate('o', 'p1', '2030-02-02T00:00:00', 'update', { userId: 'u', orgRole: 'USER' } as any), HttpException);
  assert.deepEqual(calls.map((c) => c[0]), ['terminate']);
});
