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
// a 20-video TikTok search with sorting and a date filter can take minutes; Apify ends a waiting run at 300 s
const TIKTOK_VIDEOS_TIMEOUT_MS = 290000;
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

// ---------- Security news (RSS and Atom feeds of five security outlets) ----------
export const SECURITY_FEEDS: { url: string; source: string }[] = [
  { url: 'https://www.bleepingcomputer.com/feed/', source: 'BleepingComputer' },
  { url: 'https://therecord.media/feed', source: 'The Record' },
  { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News' },
  { url: 'https://krebsonsecurity.com/feed/', source: 'KrebsOnSecurity' },
  { url: 'https://www.schneier.com/feed/atom/', source: 'Schneier on Security' },
];
// an honest reader name: a fake browser string is refused by some sites (Schneier answered 403 to it, 28 Nov 2026)
const BROWSER_UA = 'Mozilla/5.0 (compatible; hub-trends/1.0)';
// a feed may answer with one redirect, and only to its own host (feedburner: also to its outlet's site)
const FEED_REDIRECT_HOSTS: Record<string, string[]> = { 'feeds.feedburner.com': ['feeds.feedburner.com', 'thehackernews.com', 'www.thehackernews.com'] };

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// RSS <item> and Atom <entry>: the Atom link is <link href="..."/>, the date <pubDate>, <published> or <updated>
export function parseFeed(xml: string): { title: string; url: string; date: string }[] {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
  return blocks.map((b) => {
    let url = '';
    for (const l of b.matchAll(/<link\b([^>]*)>/g)) {
      const href = /\bhref\s*=\s*"([^"]*)"/.exec(l[1]);
      const rel = /\brel\s*=\s*"([^"]*)"/.exec(l[1]);
      if (href && (!rel || rel[1] === 'alternate')) { url = decodeEntities(href[1]).trim(); break; }
    }
    if (!url) url = tag(b, 'link') || tag(b, 'guid');
    const d = new Date(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'));
    return { title: stripTags(tag(b, 'title')), url, date: Number.isNaN(d.getTime()) ? '' : d.toISOString() };
  }).filter((i) => i.title && i.url);
}

async function getFeed(url: string, f: FetchFn): Promise<string> {
  const init = (redirect: 'manual' | 'error') => ({ headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, redirect, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let res = await f(url, init('manual'));
  if (res.status >= 300 && res.status < 400) {
    const here = new URL(url);
    const next = new URL(res.headers.get('location') || '', url);
    if (next.protocol !== 'https:' || !(FEED_REDIRECT_HOSTS[here.hostname] || [here.hostname]).includes(next.hostname)) throw new Error(`Source answered ${res.status}`);
    res = await f(next.toString(), init('error'));
  }
  if (!res.ok) throw new Error(`Source answered ${res.status}`);
  return res.text();
}

// items of the last 7 days from every feed; one feed failing never fails the others, and a throw only when all failed
export function securityNews(f: FetchFn = fetch, now: Date = new Date()): Promise<NewsItem[]> {
  return once('security-news', f, () => loadSecurityNews(f, now));
}

async function loadSecurityNews(f: FetchFn, now: Date): Promise<NewsItem[]> {
  const cutoff = now.getTime() - 7 * DAY;
  const out: NewsItem[] = [];
  let failed = 0;
  await Promise.all(SECURITY_FEEDS.map(async (feed) => {
    try {
      for (const i of parseFeed(await getFeed(feed.url, f))) {
        const t = Date.parse(i.date);
        if (Number.isFinite(t) && t >= cutoff && /^https?:\/\//i.test(i.url)) out.push({ ...i, source: feed.source });
      }
    } catch { failed += 1; }
  }));
  if (failed === SECURITY_FEEDS.length) throw new Error('Source answered 0 from every security feed');
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- GitHub trending (a public third-party feed for the names, the official API for the numbers) ----------
export const TRENDING_FEED = 'https://mshibanami.github.io/GitHubTrendingRSS/weekly/all.xml';
export const TRENDING_MAX = 15;
const TRENDING_PARALLEL = 4;

// <title> is "owner/repo", <link> the repo URL; the description (README text) is never kept. A name segment of "." or
// ".." is refused: the name goes into the API path, and a tampered feed must not walk to another API route
const REPO_NAME = /^(?!\.\.?\/)[\w-][\w.-]*\/(?!\.\.?$)[\w.-]+$/;
export function parseTrendingRss(xml: string): { name: string; url: string }[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({ name: tag(m[1], 'title'), url: tag(m[1], 'link') }))
    .filter((r) => REPO_NAME.test(r.name) && r.url === `https://github.com/${r.name}`);
}

// the security news and the trending list are the same for every brand: one fetch serves a whole run (30 minutes);
// an injected fetch (tests) always reads fresh
const SHARED_TTL_MS = 30 * 60 * 1000;
const shared = new Map<string, { at: number; value: Promise<unknown> }>();
function once<T>(key: string, f: FetchFn, load: () => Promise<T>): Promise<T> {
  if (f !== fetch) return load();
  const hit = shared.get(key);
  if (hit && Date.now() - hit.at < SHARED_TTL_MS) return hit.value as Promise<T>;
  const value = load();
  shared.set(key, { at: Date.now(), value });
  value.catch(() => shared.delete(key));
  return value;
}

export function githubTrending(f: FetchFn = fetch): Promise<GithubRepo[]> {
  return once('github-trending', f, () => loadGithubTrending(f));
}

async function loadGithubTrending(f: FetchFn): Promise<GithubRepo[]> {
  const repos = parseTrendingRss(await getText(TRENDING_FEED, f)).slice(0, TRENDING_MAX);
  const token = env('GITHUB_TOKEN');
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const out: GithubRepo[] = [];
  for (let i = 0; i < repos.length; i += TRENDING_PARALLEL) {
    out.push(...await Promise.all(repos.slice(i, i + TRENDING_PARALLEL).map(async (r): Promise<GithubRepo> => {
      try {
        const [owner, repo] = r.name.split('/');
        const body = await getJson<GhRepo>(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, f, headers);
        return { name: r.name, url: r.url, stars: num(body.stargazers_count), description: body.description || '', created: body.created_at || '' };
      } catch { return { name: r.name, url: r.url, stars: 0, description: '', created: '' }; }
    })));
  }
  return out;
}

// ---------- Apify ----------
// the token goes in a header, never the URL, so no error or log line can carry it
export async function apifyRun(actor: string, input: Record<string, unknown>, f: FetchFn = fetch, timeoutMs = APIFY_TIMEOUT_MS): Promise<any[]> {
  const token = env('APIFY_TOKEN');
  if (!token) return [];
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items`;
  const res = await f(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input),
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
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
    // TikTok names a creator's own audio "original sound - <handle>": only a real track name is kept
    sound: /^original sound/i.test(String(v.musicMeta?.musicName || '')) ? '' : String(v.musicMeta?.musicName || ''),
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
  return mapTiktokVideos(await apifyRun(actor, tiktokVideosInput(keyword, country), f, TIKTOK_VIDEOS_TIMEOUT_MS));
}
// <<< SANAD-BRANDS
