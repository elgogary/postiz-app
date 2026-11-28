import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decodeEntities, parseNewsRss, newsUrl, newsWindow, newsWeeks, mapHnItem, hackerNewsTop, githubUrl, mapGithub, githubNew,
  mapLinkedin, mapTiktok, linkedinInput, tiktokInput, linkedinPosts, tiktokHashtags, apifyRun,
} from './trend.sources';

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
  const weeks = await newsWeeks('erp', 'en', 'US', new Date('2026-11-28T00:00:00Z'), f);
  assert.equal(weeks.length, 5);
  assert.deepEqual(weeks[0], { count: 3, outlets: 2 });
  assert.match(new URL(urls[0]).searchParams.get('q'), /after:2026-11-21 before:2026-11-28/);
  assert.match(new URL(urls[4]).searchParams.get('q'), /after:2026-10-24 before:2026-10-31/);
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
