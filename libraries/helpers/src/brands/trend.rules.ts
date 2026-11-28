// >>> SANAD-BRANDS: trends: the weekly score, week start, topic key and the row types. Pure, shared by backend and frontend.
export const MAX_TRENDS = 8;

export interface TrendSignals {
  hnPoints: number; topRepoStars: number; linkedinReactions: number; outlets: number; platforms: number; freshShare: number;
}
export interface TrendItem {
  title: string; url: string; source: string; date: string;
  kind: 'news' | 'hn' | 'github' | 'linkedin' | 'tiktok'; metric?: string;
}
export interface TrendView {
  id: string; brandId: string; brandName: string; title: string; kind: string; pillar: string; score: number;
  growth: number | null; capped: boolean; thisWeek: number; average: number; signals: TrendSignals; items: TrendItem[];
  fit: string; ideaId: string | null; canSave: boolean;
}
export interface TrendScoreInput extends TrendSignals { growth: number | null }

const DAY = 86400000;

export const weekStart = (d: Date): Date => {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(day - new Date(day).getUTCDay() * DAY);
};

export const growthOf = (thisWeek: number, prev: number[]): number | null => {
  const mean = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
  if (mean === 0 && thisWeek < 5) return null;
  return (thisWeek - mean) / Math.max(mean, 5);
};

const part = (v: number, max = Infinity) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);

export const trendParts = (i: TrendScoreInput) => ({
  growth: (40 * part(i.growth ?? 0, 2)) / 2,
  engagement: 20 * Math.min(1, Math.max(part(i.hnPoints) / 300, part(i.topRepoStars) / 1000, part(i.linkedinReactions) / 500)),
  spread: 20 * Math.min(1, part(i.outlets) / 40 + 0.25 * (Math.max(part(i.platforms), 1) - 1)),
  freshness: 20 * part(i.freshShare, 1),
});

// Rounds the four parts so they always add up to round(total): floor each, then give the spare units to the largest remainders.
export const roundParts = (p: ReturnType<typeof trendParts>): typeof p => {
  const keys = Object.keys(p) as (keyof typeof p)[];
  const target = Math.round(keys.reduce((a, k) => a + p[k], 0));
  const out = Object.fromEntries(keys.map((k) => [k, Math.floor(p[k])])) as typeof p;
  let spare = target - keys.reduce((a, k) => a + out[k], 0);
  [...keys].sort((a, b) => (p[b] - Math.floor(p[b])) - (p[a] - Math.floor(p[a]))).forEach((k) => { if (spare > 0) { out[k] += 1; spare -= 1; } });
  return out;
};

export const trendScore = (i: TrendScoreInput): number => {
  const p = trendParts(i);
  return Math.round(p.growth + p.engagement + p.spread + p.freshness);
};

// diacritics (Arabic harakat, accents) are dropped first, so the same word with and without them gets one key
export const topicKey = (title: string): string =>
  title.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80).trim();
// <<< SANAD-BRANDS
