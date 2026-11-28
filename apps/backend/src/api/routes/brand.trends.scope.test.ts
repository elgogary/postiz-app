import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTrendScope } from './brand.trends.scope';

test('scope defaults to all and accepts ids', () => {
  assert.ok(isTrendScope('all'));
  assert.ok(isTrendScope('3f2a9c1e-1111-4a2b-8c3d-123456789abc'));
});
test('scope rejects junk', () => {
  for (const bad of ['a b', "x'; drop", '../x', 'ab', '']) assert.ok(!isTrendScope(bad));
});
