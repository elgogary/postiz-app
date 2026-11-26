import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareImport } from './plan.import';
import type { ParsedPlan } from './plan.parser';

const plan = (): ParsedPlan => ({
  sections: { summary: '<p>Hello</p>', voice: '<p>Warm</p>', routine: '', profile: '<p>Bio</p>' },
  rows: {
    pillars: [['Pillar A'], ['  '], ['Pillar B']],
    bench: [], kpi: [['Reach', 'Views', '1000']], review: [], history: [],
    focus: [['2026-01-01', '2026-01-07', 'Launch', 'Intro week']],
  },
  notes: { kpi: 'Monthly' },
  posts: [{} as any, {} as any, {} as any],
  goals: {},
});

test('writes one entry per non-empty text section and per row section; blank rows dropped', () => {
  const { writes, summary } = prepareImport(plan());
  assert.deepEqual(writes.filter((w) => w.content !== undefined).map((w) => w.key), ['summary', 'voice', 'profile']);
  assert.equal(writes.filter((w) => w.rows !== undefined).length, 6);
  assert.deepEqual(writes.find((w) => w.key === 'pillars')!.rows, [['Pillar A'], ['Pillar B']]);
  assert.equal(writes.find((w) => w.key === 'kpi')!.note, 'Monthly');
  assert.equal(writes.find((w) => w.key === 'pillars')!.note, null);
  assert.equal(summary.rows.pillars, 2);
  assert.equal(summary.rows.kpi, 1);
  assert.equal(summary.rows.bench, 0);
  assert.equal(summary.posts, 3);
  assert.deepEqual(summary.sections, ['summary', 'voice', 'profile']);
});

test('an empty text section is not written', () => {
  const { writes } = prepareImport(plan());
  assert.equal(writes.some((w) => w.key === 'routine'), false);
});

test('a bad date cell throws and names the row', () => {
  const p = plan();
  p.rows.focus = [['2026-01-01', '2026-01-07', 'A', 'b'], ['2026-13-40', '2026-01-07', 'B', 'c']];
  assert.throws(() => prepareImport(p), /Row 2/);
});

test('a text section over 100000 characters throws', () => {
  const p = plan();
  p.sections.summary = 'x'.repeat(100001);
  assert.throws(() => prepareImport(p), /too long/i);
});

test('script tags are cleaned out of text sections', () => {
  const p = plan();
  p.sections.summary = '<p>Hi</p><script>alert(1)</script>';
  const w = prepareImport(p).writes.find((x) => x.key === 'summary')!;
  assert.ok(!/<script/i.test(w.content!));
});
