import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpIdentityDeps, resolveMcpIdentity } from './mcp.identity';

const ORG = { id: 'org-1', name: 'Team' };
const deps = (over: Partial<McpIdentityDeps> = {}): McpIdentityDeps => ({
  byOAuthToken: async (t) => (t === 'pos_good' ? { organization: ORG, user: { id: 'u-1' } } : null),
  byApiKey: async (k) => (k === 'key-1' ? ORG : null),
  orgsOfUser: async () => [{ id: 'org-2', users: [{ role: 'ADMIN', disabled: false }] }, { id: 'org-1', users: [{ role: 'USER', disabled: false }] }],
  ...over,
});

test("a person's token gives the organisation, the person and their role in THAT organisation", async () => {
  assert.deepEqual(await resolveMcpIdentity('pos_good', deps()), { org: ORG, user: { id: 'u-1', role: 'USER' } });
});

test('an API key gives the organisation and no person', async () => {
  assert.deepEqual(await resolveMcpIdentity('key-1', deps()), { org: ORG });
});

test('unknown tokens and keys are refused', async () => {
  assert.equal(await resolveMcpIdentity('pos_bad', deps()), null);
  assert.equal(await resolveMcpIdentity('key-x', deps()), null);
});

test('a switched-off membership, or none in that organisation, is refused', async () => {
  assert.equal(await resolveMcpIdentity('pos_good', deps({ orgsOfUser: async () => [{ id: 'org-1', users: [{ role: 'ADMIN', disabled: true }] }] })), null);
  assert.equal(await resolveMcpIdentity('pos_good', deps({ orgsOfUser: async () => [{ id: 'org-2', users: [{ role: 'ADMIN', disabled: false }] }] })), null);
});

test('a token record without its person is refused', async () => {
  assert.equal(await resolveMcpIdentity('pos_good', deps({ byOAuthToken: async () => ({ organization: ORG }) })), null);
});
