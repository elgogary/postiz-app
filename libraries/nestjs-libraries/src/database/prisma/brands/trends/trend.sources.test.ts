import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeEntities, parseNewsRss, newsUrl, newsWindow, newsWeeks, mapHnItem, hackerNewsTop, githubUrl, mapGithub, githubNew,
  mapLinkedin, mapTiktok, linkedinInput, tiktokInput, linkedinPosts, tiktokHashtags, apifyRun, newsTopic,
  mapTiktokVideos, tiktokVideosInput, tiktokVideos, parseFeed, securityNews, parseTrendingRss, githubTrending,
} from './trend.sources';

test('newsTopic follows one redirect on news.google.com only', async () => {
  const calls: string[] = [];
  const hop = (location: string) => (async (url: string) => {
    calls.push(url);
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location } }) : res(fx('news.sample.xml'));
  }) as any;
  const items = await newsTopic('TECHNOLOGY', 'ar', 'SA', hop('https://news.google.com/rss/topics/ABC?hl=ar&gl=SA&ceid=SA:ar'));
  assert.ok(items.length > 0);
  assert.equal(calls[1], 'https://news.google.com/rss/topics/ABC?hl=ar&gl=SA&ceid=SA:ar');
  calls.length = 0;
  await assert.rejects(() => newsTopic('TECHNOLOGY', 'ar', 'SA', hop('https://other.example.test/rss')), /302/);
  assert.equal(calls.length, 1);
});

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');
const res = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('decodeEntities handles named and numeric entities, amp last', () => {
  assert.equal(decodeEntities('A &amp; B &quot;c&quot; &#39;d&#39; &lt;e&gt; &#x41; &amp;lt;'), `A & B "c" 'd' <e> A &lt;`);
});

test('parseNewsRss reads title, url, source, date, Arabic and CDATA', () => {
  const items = parseNewsRss(fx('news.sample.xml'));
  assert.equal(items.length, 3);
  assert.equal(items[0].title, 'ERP & AI: Q&A on "smart" finance \'now\' <b> \u{1F600}');
  assert.equal(items[0].url, 'https://news.example.test/a?x=1&y=2');
  assert.equal(items[0].source, 'Example Outlet');
  assert.equal(items[0].date, '2026-11-26T09:00:00.000Z');
  assert.equal(items[1].title, 'الذكاء الاصطناعي في المحاسبة');
  assert.equal(items[1].source, 'صحيفة المثال');
  assert.equal(items[2].source, '');
});

test('newsUrl: when:7d without dates, after/before with dates, ceid country:lang', () => {
  const u = new URL(newsUrl('erp', 'ar', 'EG'));
  assert.equal(u.searchParams.get('q'), 'erp when:7d');
  assert.equal(u.searchParams.get('ceid'), 'EG:ar');
  assert.equal(u.searchParams.get('hl'), 'ar');
  const w = new URL(newsUrl('erp', 'en-US', 'US', new Date('2026-11-21'), new Date('2026-11-28')));
  assert.equal(w.searchParams.get('q'), 'erp after:2026-11-21 before:2026-11-28');
  assert.equal(w.searchParams.get('ceid'), 'US:en');
});

test('newsWindow: 7-day windows ending at weekEnd, going back', () => {
  const end = new Date('2026-11-28T00:00:00Z');
  const w0 = newsWindow(end, 0), w4 = newsWindow(end, 4);
  assert.deepEqual([w0.from.toISOString().slice(0, 10), w0.to.toISOString().slice(0, 10)], ['2026-11-21', '2026-11-28']);
  assert.deepEqual([w4.from.toISOString().slice(0, 10), w4.to.toISOString().slice(0, 10)], ['2026-10-24', '2026-10-31']);
});

test('newsWeeks returns 5 entries with counts and distinct outlets, this week first', async () => {
  const urls: string[] = [];
  const f = (async (u: string) => { urls.push(u); return res(fx('news.sample.xml')); }) as any;
  const weeks = await newsWeeks('erp', 'en', 'US', new Date('2026-11-28T00:00:00Z'), f, 0);
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], { count: 3, outlets: 2 });
  assert.match(new URL(urls[0]).searchParams.get('q'), /after:2026-11-21 before:2026-11-28/);
  assert.match(new URL(urls[4]).searchParams.get('q'), /after:2026-10-24 before:2026-10-31/);
});

test('newsWeeks retries a week once after 429, and a second 429 fails', async () => {
  let n = 0;
  const once = (async () => (++n === 2 ? res('busy', 429) : res(fx('news.sample.xml')))) as any;
  const weeks = await newsWeeks('erp', 'en', 'US', new Date('2026-11-28T00:00:00Z'), once, 0);
  assert.equal(weeks.length, 5);
  assert.equal(n, 6);
  const always = (async () => res('busy', 429)) as any;
  await assert.rejects(() => newsWeeks('erp', 'en', 'US', new Date('2026-11-28T00:00:00Z'), always, 0), /429/);
});

test('mapHnItem and the points filter, 8 at a time over the first 100 ids', async () => {
  assert.equal(mapHnItem({ id: 1, dead: true, title: 'x' }), null);
  assert.deepEqual(mapHnItem({ id: 7, title: 'T', score: 120, descendants: 9, time: 1764316800 }), {
    title: 'T', url: 'https://news.ycombinator.com/item?id=7', points: 120, comments: 9, date: '2025-11-28T08:00:00.000Z',
  });
  let live = 0, peak = 0, asked = 0;
  const f = (async (u: string) => {
    if (u.endsWith('topstories.json')) return res(Array.from({ length: 150 }, (_, i) => i + 1));
    asked++; live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live--;
    const id = +(u.match(/item\/(\d+)\.json/) as RegExpMatchArray)[1];
    return res({ id, title: `S${id}`, url: `https://e.test/${id}`, score: id % 2 ? 300 : 10, descendants: 1, time: 1764316800 });
  }) as any;
  const top = await hackerNewsTop(100, f);
  assert.equal(asked, 100);
  assert.ok(peak <= 8);
  assert.equal(top.length, 50);
  assert.ok(top.every((s) => s.points >= 100));
});

test('github url and mapping', () => {
  const u = new URL(githubUrl('topic:erp', '2026-11-21'));
  assert.equal(u.searchParams.get('q'), 'created:>2026-11-21 topic:erp');
  assert.equal(u.searchParams.get('sort'), 'stars');
  assert.equal(u.searchParams.get('per_page'), '10');
  assert.deepEqual(mapGithub({ items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', stargazers_count: 42, description: null, created_at: '2026-11-25T00:00:00Z' }] }),
    [{ name: 'a/b', url: 'https://github.com/a/b', stars: 42, description: '', created: '2026-11-25T00:00:00Z' }]);
});

test('githubNew sends Authorization only when GITHUB_TOKEN is non-empty', async () => {
  const seen: any[] = [];
  const f = (async (_u: string, init: any) => { seen.push(init.headers); return res({ items: [] }); }) as any;
  const old = process.env.GITHUB_TOKEN;
  try {
    process.env.GITHUB_TOKEN = '';
    await githubNew('x', '2026-11-21', f);
    process.env.GITHUB_TOKEN = 'tok';
    await githubNew('x', '2026-11-21', f);
  } finally { if (old === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = old; }
  assert.equal(seen[0].Authorization, undefined);
  assert.equal(seen[1].Authorization, 'Bearer tok');
});

test('linkedin mapping from the saved sample (empty text skipped)', () => {
  const posts = mapLinkedin(JSON.parse(fx('linkedin.sample.json')));
  assert.deepEqual(posts, [{
    text: 'Sample post text about ERP', url: 'https://www.linkedin.com/posts/author-1_sample-activity-1000000000000000001-aaaa',
    date: '2025-11-28T08:00:00.000Z', reactions: 132, comments: 17,
  }]);
  assert.deepEqual(linkedinInput('erp'), { searchQueries: ['erp'], maxPosts: 50, postedLimit: 'week', sortBy: 'relevance' });
});

test('tiktok mapping from the saved sample', () => {
  const tags = mapTiktok(JSON.parse(fx('tiktok.sample.json')));
  assert.equal(tags.length, 2);
  assert.deepEqual(tags[0], { name: '#sampletag', url: 'https://www.tiktok.com/tag/sampletag', views: 128000000, videos: 48200, trend: 'rising', momentumPct: 36 });
  assert.equal(tags[1].momentumPct, null);
  assert.deepEqual(tiktokInput('sa', 'Tech & Electronics'), { trendType: 'hashtag', countryCode: 'SA', period: 7, maxResults: 50, industry: 'Tech & Electronics' });
});

test('apify readers skip without token or actor, and cap at 50 items', async () => {
  const keys = ['APIFY_TOKEN', 'APIFY_TREND_LINKEDIN_ACTOR', 'APIFY_TREND_TIKTOK_ACTOR'];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  let calls = 0;
  const f = (async () => { calls++; return res(Array.from({ length: 80 }, () => ({ type: 'hashtag', name: '#a' }))); }) as any;
  try {
    for (const k of keys) process.env[k] = '';
    assert.deepEqual(await linkedinPosts('erp', f), []);
    assert.deepEqual(await tiktokHashtags('SA', '', f), []);
    process.env.APIFY_TOKEN = 't';
    assert.deepEqual(await linkedinPosts('erp', f), []);
    assert.deepEqual(await tiktokHashtags('SA', '', f), []);
    assert.equal(calls, 0);
    process.env.APIFY_TREND_TIKTOK_ACTOR = 'u~a';
    assert.equal((await tiktokHashtags('SA', '', f)).length, 50);
    assert.equal(calls, 1);
  } finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
});

test('apifyRun sends the token in a header, never the URL, and skips without one', async () => {
  let seen: { url: string; init: any } | null = null;
  const f = (async (url: string, init: any) => { seen = { url, init }; return res([]); }) as any;
  assert.deepEqual(await apifyRun('u~a', {}, f), []);
  assert.equal(seen, null);
  process.env.APIFY_TOKEN = 'secret-token';
  try {
    await apifyRun('u~a', { maxResults: 50 }, f);
    assert.ok(seen && !(seen as any).url.includes('secret-token'));
    assert.equal((seen as any).init.headers.Authorization, 'Bearer secret-token');
    assert.equal((seen as any).init.redirect, 'error');
    assert.deepEqual(JSON.parse((seen as any).init.body), { maxResults: 50 });
  } finally { delete process.env.APIFY_TOKEN; }
});

test('apifyRun error never carries the token', async () => {
  process.env.APIFY_TOKEN = 'secret-token';
  try {
    await assert.rejects(() => apifyRun('u~a', {}, (async () => res('no', 401)) as any), (e: Error) => !e.message.includes('secret-token') && /401/.test(e.message));
  } finally { delete process.env.APIFY_TOKEN; }
});

test('tiktok videos: mapping from the saved sample keeps no author field', () => {
  const v = mapTiktokVideos(JSON.parse(fx('tiktok-videos.sample.json')));
  assert.equal(v.length, 4);
  assert.deepEqual(v[0], {
    text: 'Sample caption 1 about building an app from an idea #sampletag', url: 'https://www.tiktok.com/@creator-1/video/1',
    date: '2026-11-23T06:12:37.000Z', views: 33515, likes: 2446, shares: 450, comments: 15, sound: '',
  });
  assert.deepEqual(Object.keys(v[0]), ['text', 'url', 'date', 'views', 'likes', 'shares', 'comments', 'sound']);
  assert.equal(v[2].text, 'Sample caption 3 with odd spacing');
  assert.equal(v[2].sound, '');
  assert.equal(mapTiktokVideos([{ text: 'x'.repeat(500), webVideoUrl: 'https://t/1' }, { text: 'no url' }])[0].text.length, 200);
  assert.equal(mapTiktokVideos([{ text: 'a', webVideoUrl: 'https://t/1', musicMeta: { musicName: 'Track A' } }])[0].sound, 'Track A');
  assert.equal(mapTiktokVideos([{ text: 'a', webVideoUrl: 'https://t/1', musicMeta: { musicName: 'Original sound - creator-9' } }])[0].sound, '');
});

test('tiktok videos: input adds the proxy country only for a 2-letter code', () => {
  const i = tiktokVideosInput('startup idea', 'sa');
  assert.deepEqual([i.searchQueries, i.searchSection, i.resultsPerPage, i.videoSearchSorting, i.videoSearchDateFilter, i.proxyCountryCode], [['startup idea'], '/video', 20, 'MOST_LIKED', 'PAST_WEEK', 'SA']);
  assert.equal(i.shouldDownloadVideos, false);
  assert.ok(!('proxyCountryCode' in tiktokVideosInput('k', '')) && !('proxyCountryCode' in tiktokVideosInput('k', 'USA')));
});

test('tiktok videos reader skips without token or actor', async () => {
  const keys = ['APIFY_TOKEN', 'APIFY_TREND_TIKTOK_VIDEOS_ACTOR'];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  let calls = 0;
  const f = (async () => { calls++; return res(JSON.parse(fx('tiktok-videos.sample.json'))); }) as any;
  try {
    for (const k of keys) process.env[k] = '';
    assert.deepEqual(await tiktokVideos('k', 'SA', f), []);
    process.env.APIFY_TOKEN = 't';
    assert.deepEqual(await tiktokVideos('k', 'SA', f), []);
    assert.equal(calls, 0);
    process.env.APIFY_TREND_TIKTOK_VIDEOS_ACTOR = 'u~a';
    assert.equal((await tiktokVideos('k', 'SA', f)).length, 4);
    assert.equal(calls, 1);
  } finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
});

const NOW = new Date('2026-11-28T12:00:00Z');
const RSS = `<?xml version="1.0"?><rss><channel><title>Feed</title><link>https://site.example.test/</link>
<item><title>Vendor breach &amp; fix</title><link>https://site.example.test/a?x=1&amp;y=2</link><pubDate>Thu, 26 Nov 2026 09:00:00 GMT</pubDate></item>
<item><title>Old story</title><link>https://site.example.test/old</link><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate></item>
<item><title>No date</title><link>https://site.example.test/nodate</link></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><link rel="alternate" type="text/html" href="https://atom.example.test/" />
<entry><title type="html">Weak cipher claim</title><link rel="alternate" type="text/html" href="https://atom.example.test/p?a=1&amp;b=2" /><link rel="self" href="https://atom.example.test/self" /><published>2026-11-27T10:00:00Z</published><updated>2026-11-27T11:00:00Z</updated></entry>
<entry><title>Updated only</title><link href="https://atom.example.test/u"/><updated>2026-11-25T10:00:00Z</updated></entry>
</feed>`;

test('parseFeed reads RSS items and Atom entries (links by href, dates from published or updated)', () => {
  const r = parseFeed(RSS);
  assert.deepEqual(r.map((i) => [i.title, i.url, i.date]), [
    ['Vendor breach & fix', 'https://site.example.test/a?x=1&y=2', '2026-11-26T09:00:00.000Z'],
    ['Old story', 'https://site.example.test/old', '2026-11-02T09:00:00.000Z'],
    ['No date', 'https://site.example.test/nodate', ''],
  ]);
  const a = parseFeed(ATOM);
  assert.deepEqual(a.map((i) => [i.title, i.url, i.date]), [
    ['Weak cipher claim', 'https://atom.example.test/p?a=1&b=2', '2026-11-27T10:00:00.000Z'],
    ['Updated only', 'https://atom.example.test/u', '2026-11-25T10:00:00.000Z'],
  ]);
});

const feedFetch = (fail: (u: string) => boolean = () => false, seen: any[] = []) => (async (u: string, init: any) => {
  seen.push([u, init]);
  if (fail(u)) return res('no', 503);
  return res(u.includes('schneier') ? ATOM : RSS);
}) as any;

test('securityNews keeps the last 7 days, names the site, sends a browser User-Agent', async () => {
  const seen: any[] = [];
  const items = await securityNews(feedFetch(() => false, seen), NOW);
  assert.equal(seen.length, 5);
  assert.ok(seen.every(([, i]) => /^Mozilla\/5\.0/.test(i.headers['User-Agent'])));
  assert.equal(items.length, 4 + 2);
  assert.ok(items.every((i) => i.date >= '2026-11-21'));
  assert.deepEqual([...new Set(items.map((i) => i.source))].sort(), ['BleepingComputer', 'KrebsOnSecurity', 'Schneier on Security', 'The Hacker News', 'The Record']);
  assert.equal(items[0].date, '2026-11-27T10:00:00.000Z');
});

test('securityNews: one failing feed does not fail the others; all failing throws', async () => {
  const items = await securityNews(feedFetch((u) => u.includes('krebs')), NOW);
  assert.ok(items.length > 0 && !items.some((i) => i.source === 'KrebsOnSecurity'));
  await assert.rejects(() => securityNews(feedFetch(() => true), NOW), /answered/);
  await assert.rejects(() => securityNews((async () => { throw new Error('net https://secret/?key=1'); }) as any, NOW), (e: Error) => !e.message.includes('secret'));
});

test('securityNews follows one redirect for feedburner only to its own hosts', async () => {
  const hop = (location: string) => (async (u: string) => {
    if (u === 'https://feeds.feedburner.com/TheHackersNews') return new Response(null, { status: 301, headers: { location } });
    if (u.includes('feedburner') || u.includes('thehackernews')) return res(RSS);
    return res('no', 503);
  }) as any;
  const ok = await securityNews(hop('https://thehackernews.com/feeds/posts/default'), NOW);
  assert.ok(ok.some((i) => i.source === 'The Hacker News'));
  const bad = await securityNews(hop('https://other.example.test/rss'), NOW).catch(() => []);
  assert.ok(!bad.some((i) => i.source === 'The Hacker News'));
});

const TRENDING = `<rss><channel><title>T</title><link>https://t.example.test</link>
<item><title>owner-a/repo-a</title><link>https://github.com/owner-a/repo-a</link><description>&lt;p&gt;README text&lt;/p&gt;</description></item>
<item><title>owner-b/repo.b</title><link>https://github.com/owner-b/repo.b</link><description>x</description></item>
<item><title>not a repo</title><link>https://github.com/x/y</link></item>
<item><title>evil/repo</title><link>https://evil.example.test/evil/repo</link></item>
</channel></rss>`;

test('parseTrendingRss keeps titles and links only and drops odd entries', () => {
  assert.deepEqual(parseTrendingRss(TRENDING), [
    { name: 'owner-a/repo-a', url: 'https://github.com/owner-a/repo-a' },
    { name: 'owner-b/repo.b', url: 'https://github.com/owner-b/repo.b' },
  ]);
});

test('parseTrendingRss refuses "." and ".." segments, so a tampered feed cannot walk the API path', () => {
  const feed = (name: string) => `<rss><channel><item><title>${name}</title><link>https://github.com/${name}</link></item></channel></rss>`;
  for (const bad of ['../user', '../..', 'owner/..', 'owner/.', './repo', '.hidden/repo']) assert.deepEqual(parseTrendingRss(feed(bad)), [], bad);
  assert.equal(parseTrendingRss(feed('owner/repo.js')).length, 1);
  assert.equal(parseTrendingRss(feed('owner-1/.github')).length, 1);
});

test('githubTrending looks up stars officially, token only when set, failure keeps 0', async () => {
  const seen: [string, any][] = [];
  const f = (async (u: string, init: any) => {
    seen.push([u, init]);
    if (u.includes('GitHubTrendingRSS')) return res(TRENDING);
    if (u.endsWith('/repo-a')) return res({ stargazers_count: 321, description: 'Short text', created_at: '2026-11-20T00:00:00Z' });
    return res('no', 404);
  }) as any;
  const old = process.env.GITHUB_TOKEN;
  try {
    process.env.GITHUB_TOKEN = '';
    const none = await githubTrending(f);
    assert.deepEqual(none, [
      { name: 'owner-a/repo-a', url: 'https://github.com/owner-a/repo-a', stars: 321, description: 'Short text', created: '2026-11-20T00:00:00Z' },
      { name: 'owner-b/repo.b', url: 'https://github.com/owner-b/repo.b', stars: 0, description: '', created: '' },
    ]);
    const api = seen.filter(([u]) => u.startsWith('https://api.github.com/repos/'));
    assert.equal(api.length, 2);
    assert.ok(api.every(([, i]) => i.headers.Authorization === undefined));
    seen.length = 0;
    process.env.GITHUB_TOKEN = 'tok';
    await githubTrending(f);
    assert.ok(seen.filter(([u]) => u.startsWith('https://api.github.com/')).every(([, i]) => i.headers.Authorization === 'Bearer tok'));
    assert.ok(seen.filter(([u]) => !u.startsWith('https://api.github.com/')).every(([, i]) => i.headers.Authorization === undefined));
  } finally { if (old === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = old; }
});

test('githubTrending reads at most 15 repos, 4 lookups at a time', async () => {
  const feed = '<rss><channel>' + Array.from({ length: 25 }, (_, n) => `<item><title>o/r${n}</title><link>https://github.com/o/r${n}</link></item>`).join('') + '</channel></rss>';
  let live = 0, peak = 0, calls = 0;
  const f = (async (u: string) => {
    if (u.includes('GitHubTrendingRSS')) return res(feed);
    calls += 1; live += 1; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live -= 1;
    return res({ stargazers_count: 1 });
  }) as any;
  const r = await githubTrending(f);
  assert.equal(r.length, 15);
  assert.equal(calls, 15);
  assert.ok(peak <= 4);
});
