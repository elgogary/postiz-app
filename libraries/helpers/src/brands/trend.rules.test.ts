import test from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, growthOf, trendScore, trendParts, roundParts, topicKey, MAX_TRENDS } from './trend.rules';

const base = { hnPoints: 0, topRepoStars: 0, linkedinReactions: 0, outlets: 0, platforms: 1, freshShare: 0 };

test('score: known values', () => {
  assert.equal(trendScore({ ...base, growth: 0.33, hnPoints: 239, topRepoStars: 928, outlets: 43, platforms: 3, freshShare: 1 }), 65);
  assert.equal(trendScore({ ...base, growth: 0.63, outlets: 53, freshShare: 1 }), 53);
  assert.equal(trendScore({ ...base, growth: 1.76, outlets: 25, freshShare: 1 }), 68);
  assert.equal(trendScore({ ...base, growth: null }), 0);
});

test('score: growth is floored at 0 and capped at 2', () => {
  assert.equal(trendScore({ ...base, growth: -3 }), 0);
  assert.equal(trendScore({ ...base, growth: 9 }), 40);
});

test('growthOf: floor of 5 and null case', () => {
  assert.equal(growthOf(3, [0, 0, 0, 0]), null);
  assert.equal(growthOf(5, [0, 0, 0, 0]), 1);
  assert.equal(growthOf(20, [10, 10, 10, 10]), 1);
  assert.equal(growthOf(8, [2, 2, 2, 2]), 1.2);
});

test('weekStart: Sunday maps to itself, Saturday to the Sunday before', () => {
  assert.equal(weekStart(new Date('2026-11-29T15:30:00Z')).toISOString(), '2026-11-29T00:00:00.000Z');
  assert.equal(weekStart(new Date('2026-11-28T23:59:59Z')).toISOString(), '2026-11-22T00:00:00.000Z');
  assert.equal(weekStart(new Date('2026-12-02T10:00:00Z')).toISOString(), '2026-11-29T00:00:00.000Z');
});

test('topicKey: lowercase, any script, single spaces, max 80', () => {
  assert.equal(topicKey('  AI Agents, in B2B!! '), 'ai agents in b2b');
  assert.equal(topicKey('الذكاء الاصطناعي: في 2026!'), 'الذكاء الاصطناعي في 2026');
  assert.equal(topicKey('a'.repeat(100)).length, 80);
});

test('topicKey: the same word with and without diacritics gets one key', () => {
  assert.equal(topicKey('مُحَمَّد'), topicKey('محمد'));
  assert.equal(topicKey('Café Résumé'), 'cafe resume');
});

test('trendScore: bad inputs never break the score', () => {
  const zero = { growth: null, hnPoints: 0, topRepoStars: 0, linkedinReactions: 0, outlets: 0, platforms: 0, freshShare: 0 };
  assert.equal(trendScore(zero), 0);
  assert.equal(trendScore({ ...zero, growth: Number.NaN }), 0);
  assert.equal(trendScore({ ...zero, freshShare: 3 }), 20);
  assert.equal(trendScore({ ...zero, freshShare: -1 }), 0);
  assert.equal(trendScore({ ...zero, hnPoints: Number.NaN, outlets: 40, platforms: 1 }), 20);
});

test('MAX_TRENDS', () => assert.equal(MAX_TRENDS, 8));

test('parts: the four parts add up to the score', () => {
  const i = { ...base, growth: 0.63, outlets: 53, freshShare: 1 };
  const p = trendParts(i);
  assert.deepEqual([Math.round(p.growth), Math.round(p.engagement), Math.round(p.spread), Math.round(p.freshness)], [13, 0, 20, 20]);
  assert.equal(Math.round(p.growth + p.engagement + p.spread + p.freshness), trendScore(i));
});

test('roundParts: parts always add up to the rounded total', () => {
  const naive = { growth: 10.6, engagement: 10.6, spread: 10.6, freshness: 10.4 };
  assert.equal(Object.values(naive).reduce((a, v) => a + Math.round(v), 0), 43);
  const r = roundParts(naive);
  assert.equal(r.growth + r.engagement + r.spread + r.freshness, 42);
  assert.deepEqual(r, { growth: 11, engagement: 11, spread: 10, freshness: 10 });
  const q = roundParts(trendParts({ ...base, growth: 0.33, hnPoints: 239, topRepoStars: 928, outlets: 43, platforms: 3, freshShare: 1 }));
  assert.equal(q.growth + q.engagement + q.spread + q.freshness, 65);
});
