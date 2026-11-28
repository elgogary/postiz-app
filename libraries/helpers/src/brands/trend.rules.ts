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

export const trendScore = (i: TrendScoreInput): number => {
  const growth = (40 * Math.min(Math.max(i.growth ?? 0, 0), 2)) / 2;
  const reach = 20 * Math.min(1, Math.max(i.hnPoints / 300, i.topRepoStars / 1000, i.linkedinReactions / 500));
  const spread = 20 * Math.min(1, i.outlets / 40 + 0.25 * (i.platforms - 1));
  return Math.round(growth + reach + spread + 20 * i.freshShare);
};

export const topicKey = (title: string): string =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80).trim();
// <<< SANAD-BRANDS
