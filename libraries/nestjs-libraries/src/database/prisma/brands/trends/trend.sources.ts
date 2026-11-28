// >>> SANAD-BRANDS: trends: source readers. Parsers are pure and exported; fetchers are thin and never log a key or a token.
// Every source is optional: callers catch a throw and skip that source.
export type FetchFn = typeof fetch;

export interface NewsItem { title: string; url: string; source: string; date: string }
export interface NewsWeek { count: number; outlets: number }
export interface HnStory { title: string; url: string; points: number; comments: number; date: string }
export interface GithubRepo { name: string; url: string; stars: number; description: string; created: string }
export interface LinkedinPost { text: string; url: string; date: string; reactions: number; comments: number }
export interface TiktokVideo { text: string; url: string; date: string; views: number; likes: number; shares: number; comments: number; sound: string }
export interface TiktokTag { name: string; url: string; views: number; videos: number; trend: string; momentumPct: number | null }

const TIMEOUT_MS = 20000;
const APIFY_TIMEOUT_MS = 120000;
export const APIFY_MAX_ITEMS = 50;
const DAY = 86400000;
const HN = 'https://hacker-news.firebaseio.com/v0';

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const env = (k: string) => (process.env[k] || '').trim();

async function getText(url: string, f: FetchFn, headers: Record<string, string> = {}): Promise<string> {
  const res = await f(url, { headers: { 'User-Agent': 'hub-trends', ...headers }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Source answered ${res.status}`);
  return res.text();
}
const getJson = async <T>(url: string, f: FetchFn, headers?: Record<string, string>): Promise<T> => JSON.parse(await getText(url, f, headers)) as T;

// ---------- Google News RSS ----------
export function decodeEntities(s: string): string {
  const cp = (n: number) => { try { return String.fromCodePoint(n); } catch { return ''; } };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => cp(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
const unwrap = (s: string) => {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (m ? m[1] : decodeEntities(s)).trim();
};
const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : '';
};

export function parseNewsRss(xml: string): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const b = m[1];
    const source = tag(b, 'source');
    let title = tag(b, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const d = new Date(tag(b, 'pubDate'));
    return { title, url: tag(b, 'link'), source, date: Number.isNaN(d.getTime()) ? '' : d.toISOString() };
  }).filter((i) => i.title && i.url);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function newsUrl(q: string, lang: string, country: string, from?: Date, to?: Date): string {
  const l = lang.split('-')[0];
  const query = from && to ? `${q} after:${ymd(from)} before:${ymd(to)}` : `${q} when:7d`;
  return 'https://news.google.com/rss/search?' + new URLSearchParams({ q: query, hl: lang, gl: country, ceid: `${country}:${l}` });
}

export async function newsItems(q: string, lang: string, country: string, f: FetchFn = fetch): Promise<NewsItem[]> {
  return parseNewsRss(await getText(newsUrl(q, lang, country), f));
}

// the Google News front-page feed of one topic (TECHNOLOGY, BUSINESS) for a country and language
export function newsTopicUrl(topic: string, lang: string, country: string): string {
  return `https://news.google.com/rss/headlines/section/topic/${encodeURIComponent(topic)}?` + new URLSearchParams({ hl: lang, gl: country, ceid: `${country}:${lang.split('-')[0]}` });
}

// a topic feed answers with one redirect to /rss/topics/<id> on the same host: follow only that one
export async function newsTopic(topic: string, lang: string, country: string, f: FetchFn = fetch): Promise<NewsItem[]> {
  const url = newsTopicUrl(topic, lang, country);
  const res = await f(url, { headers: { 'User-Agent': 'hub-trends' }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status >= 300 && res.status < 400) {
    const next = new URL(res.headers.get('location') || '', url);
    if (next.protocol !== 'https:' || next.hostname !== 'news.google.com') throw new Error(`Source answered ${res.status}`);
    return parseNewsRss(await getText(next.toString(), f));
  }
  if (!res.ok) throw new Error(`Source answered ${res.status}`);
  return parseNewsRss(await res.text());
}

// window w (0 = this week) is the 7 days ending at weekEnd minus 7*w days
export function newsWindow(weekEnd: Date, w: number): { from: Date; to: Date } {
  return { from: new Date(weekEnd.getTime() - DAY * 7 * (w + 1)), to: new Date(weekEnd.getTime() - DAY * 7 * w) };
}

// Google News answers 429 to a quick burst: a pause between the five weeks, and one retry after a longer wait
const NEWS_PAUSE_MS = 1500;
const NEWS_RETRY_MS = 8000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function newsWeeks(q: string, lang: string, country: string, weekEnd: Date, f: FetchFn = fetch, pauseMs = NEWS_PAUSE_MS): Promise<NewsWeek[]> {
  const out: NewsWeek[] = [];
  for (let w = 0; w < 5; w++) {
    if (w > 0) await wait(pauseMs);
    const { from, to } = newsWindow(weekEnd, w);
    const url = newsUrl(q, lang, country, from, to);
    const xml = await getText(url, f).catch(async (e: Error) => {
      if (!/ 429$/.test(e.message)) throw e;
      await wait(pauseMs && NEWS_RETRY_MS);
      return getText(url, f);
    });
    const items = parseNewsRss(xml);
    out.push({ count: items.length, outlets: new Set(items.map((i) => i.source).filter(Boolean)).size });
  }
  return out;
}

// ---------- Hacker News ----------
type HnItem = { title?: string; url?: string; id?: number; score?: number; descendants?: number; time?: number; dead?: boolean; deleted?: boolean };

export function mapHnItem(i: HnItem | null): HnStory | null {
  if (!i || i.dead || i.deleted || !i.title) return null;
  return {
    title: i.title,
    url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
    points: num(i.score), comments: num(i.descendants),
    date: i.time ? new Date(i.time * 1000).toISOString() : '',
  };
}

export async function hackerNewsTop(minPoints: number, f: FetchFn = fetch): Promise<HnStory[]> {
  const ids = (await getJson<number[]>(`${HN}/topstories.json`, f)).slice(0, 100);
  const out: HnStory[] = [];
  for (let i = 0; i < ids.length; i += 8) {
    const batch = await Promise.all(ids.slice(i, i + 8).map((id) => getJson<HnItem | null>(`${HN}/item/${id}.json`, f).catch(() => null)));
    for (const s of batch.map(mapHnItem)) if (s && s.points >= minPoints) out.push(s);
  }
  return out;
}

// ---------- GitHub (official search API only) ----------
type GhRepo = { full_name?: string; html_url?: string; stargazers_count?: number; description?: string | null; created_at?: string };

export const githubUrl = (query: string, since: string) =>
  'https://api.github.com/search/repositories?' + new URLSearchParams({ q: `created:>${since} ${query}`.trim(), sort: 'stars', order: 'desc', per_page: '10' });

export const mapGithub = (body: { items?: GhRepo[] }): GithubRepo[] =>
  (body.items || []).map((r) => ({
    name: r.full_name || '', url: r.html_url || '', stars: num(r.stargazers_count),
    description: r.description || '', created: r.created_at || '',
  })).filter((r) => r.name);

export async function githubNew(query: string, since: string, f: FetchFn = fetch): Promise<GithubRepo[]> {
  const token = env('GITHUB_TOKEN');
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return mapGithub(await getJson(githubUrl(query, since), f, headers));
}

// ---------- Apify ----------
// the token goes in a header, never the URL, so no error or log line can carry it
export async function apifyRun(actor: string, input: Record<string, unknown>, f: FetchFn = fetch): Promise<any[]> {
  const token = env('APIFY_TOKEN');
  if (!token) return [];
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items`;
  const res = await f(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input),
    redirect: 'error', signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Apify actor ${actor} answered ${res.status}`);
  const items = await res.json();
  return Array.isArray(items) ? items.slice(0, APIFY_MAX_ITEMS) : [];
}

// harvestapi~linkedin-post-search: engagement.likes is the reaction total, comments separate
export const mapLinkedin = (items: any[]): LinkedinPost[] =>
  items.filter((p) => p && p.content && p.linkedinUrl).map((p) => ({
    text: String(p.content).slice(0, 400), url: String(p.linkedinUrl),
    date: p.postedAt?.date || '', reactions: num(p.engagement?.likes), comments: num(p.engagement?.comments),
  }));

export const linkedinInput = (keyword: string) => ({ searchQueries: [keyword], maxPosts: APIFY_MAX_ITEMS, postedLimit: 'week', sortBy: 'relevance' });

export async function linkedinPosts(keyword: string, f: FetchFn = fetch): Promise<LinkedinPost[]> {
  const actor = env('APIFY_TREND_LINKEDIN_ACTOR');
  if (!env('APIFY_TOKEN') || !actor) return [];
  return mapLinkedin(await apifyRun(actor, linkedinInput(keyword), f));
}

// automation-lab~tiktok-trends-scraper, trendType hashtag: Creative Center, 7 days
export const mapTiktok = (items: any[]): TiktokTag[] =>
  items.filter((t) => t && t.type === 'hashtag' && t.name).map((t) => ({
    name: String(t.name), url: t.hashtagUrl || '', views: num(t.videoViews), videos: num(t.publishedVideoCount),
    trend: t.trend || '', momentumPct: t.momentumPct == null ? null : num(t.momentumPct),
  }));

export const tiktokInput = (country: string, industry: string) => {
  const input: Record<string, unknown> = { trendType: 'hashtag', countryCode: country.toUpperCase(), period: 7, maxResults: APIFY_MAX_ITEMS };
  if (industry) input.industry = industry;
  return input;
};

export async function tiktokHashtags(country: string, industry: string, f: FetchFn = fetch): Promise<TiktokTag[]> {
  const actor = env('APIFY_TREND_TIKTOK_ACTOR');
  if (!env('APIFY_TOKEN') || !actor) return [];
  return mapTiktok(await apifyRun(actor, tiktokInput(country, industry), f));
}

// clockworks~tiktok-scraper, video search: text, webVideoUrl, createTimeISO, playCount, diggCount, shareCount, commentCount,
// musicMeta.musicName. Author fields (authorMeta) are left out on purpose: a video is kept without who made it.
export const mapTiktokVideos = (items: any[]): TiktokVideo[] =>
  items.filter((v) => v && v.webVideoUrl).map((v) => ({
    text: String(v.text || '').replace(/\s+/g, ' ').trim().slice(0, 200), url: String(v.webVideoUrl),
    date: v.createTimeISO || (num(v.createTime) ? new Date(num(v.createTime) * 1000).toISOString() : ''),
    views: num(v.playCount), likes: num(v.diggCount), shares: num(v.shareCount), comments: num(v.commentCount),
    sound: String(v.musicMeta?.musicName || ''),
  }));

export const tiktokVideosInput = (keyword: string, country: string) => {
  const input: Record<string, unknown> = {
    searchQueries: [keyword], searchSection: '/video', resultsPerPage: 20, videoSearchSorting: 'MOST_LIKED', videoSearchDateFilter: 'PAST_WEEK',
    shouldDownloadVideos: false, shouldDownloadCovers: false, shouldDownloadSlideshowImages: false, shouldDownloadAvatars: false, shouldDownloadMusicCovers: false,
  };
  if (/^[A-Za-z]{2}$/.test(country)) input.proxyCountryCode = country.toUpperCase();
  return input;
};

export async function tiktokVideos(keyword: string, country: string, f: FetchFn = fetch): Promise<TiktokVideo[]> {
  const actor = env('APIFY_TREND_TIKTOK_VIDEOS_ACTOR');
  if (!env('APIFY_TOKEN') || !actor) return [];
  return mapTiktokVideos(await apifyRun(actor, tiktokVideosInput(keyword, country), f));
}
// <<< SANAD-BRANDS
