// >>> SANAD-BRANDS: trends: the weekly pipeline (plan the search, collect, cluster, measure, save), the list the page
// shows, and Save as idea. Brands and topics run one after another. Every source is optional: a failure is logged once
// per brand and source (name and status only) and that source counts as empty.
import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandsRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.repository';
import { BrandIdeasRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.ideas.repository';
import { BrandTrendsRepository, TrendWrite } from '@gitroom/nestjs-libraries/database/prisma/brands/trends/brand.trends.repository';
import { Cluster, TrendAi, TrendPlan } from '@gitroom/nestjs-libraries/database/prisma/brands/trends/trend.ai';
import * as src from '@gitroom/nestjs-libraries/database/prisma/brands/trends/trend.sources';
import { BrandRole, OrgRole, canEdit } from '@gitroom/helpers/brands/brand.rules';
import { composeIdeaText } from '@gitroom/helpers/brands/idea.rules';
import { MAX_TRENDS, TrendItem, TrendSignals, TrendView, growthOf, topicKey, trendScore, weekStart } from '@gitroom/helpers/brands/trend.rules';

export interface TrendSources {
  newsItems: typeof src.newsItems; newsTopic: typeof src.newsTopic; newsWeeks: typeof src.newsWeeks;
  hackerNewsTop: typeof src.hackerNewsTop; githubNew: typeof src.githubNew;
  securityNews: typeof src.securityNews; githubTrending: typeof src.githubTrending;
  linkedinPosts: typeof src.linkedinPosts; tiktokHashtags: typeof src.tiktokHashtags; tiktokVideos: typeof src.tiktokVideos;
}
const LIVE: TrendSources = {
  newsItems: src.newsItems, newsTopic: src.newsTopic, newsWeeks: src.newsWeeks, hackerNewsTop: src.hackerNewsTop,
  githubNew: src.githubNew, securityNews: src.securityNews, githubTrending: src.githubTrending, linkedinPosts: src.linkedinPosts, tiktokHashtags: src.tiktokHashtags, tiktokVideos: src.tiktokVideos,
};

// a found item and its raw engagement number (points, stars or reactions), kept for the score only
type Found = TrendItem & { id: string; n: number };
type Brand = { id: string; name: string; role: BrandRole };
export interface RunResult { brand: string; trends: number; skipped?: string }

const DAY = 86400000;
const CAP = 100;
const MAX_FOUND = 120;
const MAX_SHOWN = 6;
const MAX_SECURITY = 30;
const TEXT_CAP = 3000;
const HN_MIN_POINTS = 100;
// a hashtag's views are a running total of all time, so only video links count toward the score
const TIKTOK_VIDEO = /\/video\//;
const WEB_LINK = /^https?:\/\//i;
const FEEDS = ['TECHNOLOGY', 'BUSINESS'];

const plain = (html: string | null | undefined) =>
  (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP);

// only the source name and an HTTP status reach the log: never a URL, a cause or a key
const reason = (e: unknown) => {
  const m = /answered (\d{3})/.exec((e as Error)?.message || '');
  return m ? `status ${m[1]}` : 'failed';
};

@Injectable()
export class BrandTrendsService {
  private readonly _log = new Logger('BrandTrendsService');
  // replaced in tests
  sources: TrendSources = LIVE;
  now: () => Date = () => new Date();
  private readonly _saving = new Set<string>();
  private readonly _running = new Set<string>();

  isRunning(orgId: string) { return this._running.has(orgId); }

  constructor(private _brands: BrandsService, private _brandsRepo: BrandsRepository, private _repo: BrandTrendsRepository,
    private _ideas: BrandIdeasRepository, private _ai: TrendAi) {}

  async run(orgId?: string, brandId?: string): Promise<RunResult[]> {
    if (orgId && this._running.has(orgId)) return [{ brand: '', trends: 0, skipped: 'a run is already in progress' }];
    const orgs = orgId ? [orgId] : await this._repo.orgsWithPillars();
    const out: RunResult[] = [];
    for (const org of orgs) {
      if (this._running.has(org)) continue;
      this._running.add(org);
      try {
        for (const brand of (await this._brandsRepo.customers(org)).filter((b) => !brandId || b.id === brandId)) out.push(await this.runBrand(org, brand));
      } catch (e) {
        this._log.warn(`Trends: an organization was skipped (${reason(e)})`);
      } finally {
        this._running.delete(org);
      }
    }
    return out;
  }

  private async runBrand(orgId: string, brand: { id: string; name: string }): Promise<RunResult> {
    const skip = (why: string): RunResult => {
      this._log.warn(`Trends: ${brand.name} skipped, ${why}`);
      return { brand: brand.name, trends: 0, skipped: why };
    };
    try {
      const sections = await this._brandsRepo.sections(orgId, brand.id);
      const text = (key: string) => plain(sections.find((s) => s.key === key)?.content);
      const rows = sections.find((s) => s.key === 'pillars')?.rows;
      const pillars = (Array.isArray(rows) ? (rows as string[][]) : []).map((r) => (r[0] || '').trim()).filter(Boolean);
      if (!pillars.length) return { brand: brand.name, trends: 0, skipped: 'no pillars' };
      const plan = await this._ai.plan({ brand: brand.name, summary: text('summary'), voice: text('voice'), pillars });
      if (!plan) return skip('no search plan from the AI');
      const failed = new Set<string>();
      const safe = async <T>(source: string, fn: () => Promise<T>, empty: T): Promise<T> => {
        if (source === 'news' && failed.has(source)) return empty;
        try { return await fn(); } catch (e) {
          if (!failed.has(source)) { failed.add(source); this._log.warn(`Trends: ${brand.name}: source ${source} ${reason(e)}`); }
          return empty;
        }
      };
      const found = await this.collect(plan, safe);
      const clusters = await this._ai.cluster({
        brand: brand.name, language: plan.language, pillars,
        items: found.map((f) => ({ id: f.id, kind: f.kind, title: f.title, source: f.source, metric: f.metric })),
      });
      if (!clusters) return skip('no topics from the AI');
      const week = weekStart(this.now());
      const built: TrendWrite[] = [];
      for (const c of clusters) {
        if (!pillars.includes(c.pillar)) continue;
        built.push(await this.measure(c, found, plan, safe));
      }
      const best = new Map<string, TrendWrite>();
      for (const t of built) if (t.key && (best.get(t.key)?.score ?? -1) < (t.score ?? 0)) best.set(t.key, t);
      const top = [...best.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, MAX_TRENDS);
      await this._repo.saveWeek(orgId, brand.id, week, top);
      return { brand: brand.name, trends: top.length };
    } catch (e) {
      return skip(`error ${reason(e)}`);
    }
  }

  private async collect(plan: TrendPlan, safe: <T>(s: string, fn: () => Promise<T>, empty: T) => Promise<T>): Promise<Found[]> {
    const s = this.sources;
    const out: Found[] = [];
    const seen = new Set<string>();
    const add = (i: Omit<Found, 'id'>) => {
      if (!i.title || !i.url || !WEB_LINK.test(i.url) || seen.has(i.url)) return;
      seen.add(i.url);
      out.push({ ...i, id: `n${out.length + 1}` });
    };
    const news = (n: { title: string; url: string; source: string; date: string }) =>
      add({ title: n.title, url: n.url, source: n.source, date: n.date, kind: 'news', n: 0 });
    // News comes last in the cap: the engagement sources are the scarcer signal
    const newsFound: Omit<Found, 'id'>[] = [];
    for (const q of plan.newsQueries) for (const n of await safe('news', () => s.newsItems(q, plan.language, plan.country), [])) {
      newsFound.push({ title: n.title, url: n.url, source: n.source, date: n.date, kind: 'news', n: 0 });
    }
    for (const f of FEEDS) for (const n of await safe('news-feed', () => s.newsTopic(f, plan.language, plan.country), [])) {
      newsFound.push({ title: n.title, url: n.url, source: n.source, date: n.date, kind: 'news', n: 0 });
    }
    if (plan.security) {
      for (const n of (await safe('security', () => s.securityNews(), [])).slice(0, MAX_SECURITY)) {
        add({ title: n.title, url: n.url, source: n.source, date: n.date, kind: 'security', n: 0 });
      }
    }
    if (plan.tech) {
      for (const h of await safe('hackernews', () => s.hackerNewsTop(HN_MIN_POINTS), [])) {
        add({ title: h.title, url: h.url, source: 'Hacker News', date: h.date, kind: 'hn', metric: `${h.points} points`, n: h.points });
      }
      const since = new Date(this.now().getTime() - 7 * DAY).toISOString().slice(0, 10);
      for (const q of plan.githubQueries) for (const r of await safe('github', () => s.githubNew(q, since), [])) {
        add({ title: r.name, url: r.url, source: 'GitHub', date: r.created, kind: 'github', metric: `${r.stars} stars`, n: r.stars });
      }
    }
    if (plan.tech) {
      for (const r of await safe('github-trending', () => s.githubTrending(), [])) {
        add({ title: r.description ? `${r.name} · ${r.description}` : r.name, url: r.url, source: 'GitHub trending', date: r.created, kind: 'github', metric: `${r.stars} stars`, n: r.stars });
      }
    }
    for (const k of plan.linkedinKeywords) for (const p of await safe('linkedin', () => s.linkedinPosts(k), [])) {
      add({ title: p.text, url: p.url, source: 'LinkedIn', date: p.date, kind: 'linkedin', metric: `${p.reactions} reactions`, n: p.reactions });
    }
    if (plan.tiktok) for (const t of await safe('tiktok', () => s.tiktokHashtags(plan.tiktok!.country, plan.tiktok!.industry), [])) {
      add({ title: `#${t.name}`, url: t.url, source: 'TikTok', date: '', kind: 'tiktok', metric: `${t.views} views`, n: t.views });
    }
    // the (up to 3) video searches run side by side: one Apify run can take two minutes
    const videoLists = await Promise.all((plan.videoKeywords || []).map((k) => safe('tiktok-videos', () => s.tiktokVideos(k, plan.country), [])));
    for (const v of videoLists.flat()) {
      add({ title: v.text, url: v.url, source: 'TikTok', date: v.date, kind: 'tiktok', metric: `${v.views} views`, n: v.views });
    }
    const room = Math.max(0, MAX_FOUND - out.length);
    newsFound.slice(0, room).forEach(news);
    return out;
  }

  private async measure(c: Cluster, found: Found[], plan: TrendPlan,
    safe: <T>(s: string, fn: () => Promise<T>, empty: T) => Promise<T>): Promise<TrendWrite> {
    const byId = new Map(found.map((f) => [f.id, f]));
    const matched = [...new Set(c.itemIds)].map((id) => byId.get(id)).filter((f): f is Found => !!f);
    const end = new Date(weekStart(this.now()).getTime() + 7 * DAY);
    const weeks = await safe('news-count', () => this.sources.newsWeeks(c.countQuery, plan.language, plan.country, end), null);
    const thisWeek = weeks?.[0]?.count ?? 0;
    const prev = (weeks || []).slice(1).map((w) => w.count);
    const growth = weeks ? growthOf(thisWeek, prev) : null;
    const max = (kind: string) => Math.max(0, ...matched.filter((m) => m.kind === kind).map((m) => m.n));
    const cutoff = this.now().getTime() - 7 * DAY;
    const fresh = matched.filter((m) => { const t = Date.parse(m.date); return Number.isFinite(t) && t >= cutoff; }).length;
    const signals: TrendSignals = {
      hnPoints: max('hn'), tiktokViews: Math.max(0, ...matched.filter((m) => m.kind === 'tiktok' && TIKTOK_VIDEO.test(m.url)).map((m) => m.n)), topRepoStars: max('github'), linkedinReactions: matched.filter((m) => m.kind === 'linkedin').reduce((a, m) => a + m.n, 0),
      outlets: weeks?.[0]?.outlets ?? 0, securitySites: new Set(matched.filter((m) => m.kind === 'security').map((m) => m.source)).size, platforms: new Set(matched.map((m) => m.kind)).size, freshShare: matched.length ? fresh / matched.length : 0,
    };
    return {
      key: topicKey(c.title), title: c.title, kind: c.kind, pillar: c.pillar, score: trendScore({ ...signals, growth }), growth,
      capped: thisWeek >= CAP, thisWeek, average: prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0,
      signals: signals as never, items: matched.slice(0, MAX_SHOWN).map(({ id, n, ...item }) => item) as never,
      fit: c.fit, hook: c.hook, angle: c.angle, bullets: c.bullets as never,
    };
  }

  async list(orgId: string, userId: string, orgRole: OrgRole, scope: string): Promise<{ week: string | null; trends: TrendView[] }> {
    const brands = (await this._brands.list(orgId, userId, orgRole)) as Brand[];
    if (scope !== 'all' && !brands.some((b) => b.id === scope)) throw new NotFoundException('Brand not found');
    const visible = scope === 'all' ? brands : brands.filter((b) => b.id === scope);
    const weeks = await this._repo.latestWeeks(orgId, visible.map((b) => b.id));
    if (!weeks.size) return { week: null, trends: [] };
    const week = new Date(Math.max(...[...weeks.values()].map((w) => w.getTime())));
    const rows = await this._repo.rowsOf(orgId, weeks);
    const brandOf = new Map(visible.map((b) => [b.id, b]));
    const trends = rows.filter((r) => brandOf.has(r.customerId)).map((r): TrendView => {
      const b = brandOf.get(r.customerId)!;
      return {
        id: r.id, brandId: b.id, brandName: b.name, title: r.title, kind: r.kind, pillar: r.pillar, score: r.score, growth: r.growth,
        capped: r.capped, thisWeek: r.thisWeek, average: r.average, signals: r.signals as unknown as TrendSignals,
        items: r.items as unknown as TrendItem[], fit: r.fit, ideaId: r.ideaId, canSave: canEdit(b.role),
      };
    }).sort((a, b) => b.score - a.score);
    return { week: week.toISOString(), trends };
  }

  async saveAsIdea(orgId: string, userId: string, orgRole: OrgRole, trendId: string): Promise<{ ideaId: string }> {
    const brands = (await this._brands.list(orgId, userId, orgRole)) as Brand[];
    const row = await this._repo.row(orgId, trendId);
    const brand = row && brands.find((b) => b.id === row.customerId);
    if (!row || !brand) throw new NotFoundException('Trend not found');
    if (!canEdit(brand.role)) throw new ForbiddenException('You can view this brand but not add ideas');
    if (row.ideaId) return { ideaId: row.ideaId };
    if (this._saving.has(trendId)) throw new ConflictException('This trend is being saved');
    this._saving.add(trendId);
    try {
      const items = (row.items as unknown as TrendItem[]) || [];
      const bullets = ((row.bullets as unknown as string[]) || []).filter(Boolean);
      const hook = row.hook || row.title;
      const idea = await this._ideas.create({
        organizationId: orgId, idea: composeIdeaText({ hook, angle: row.angle, bullets }), source: items[0]?.url || null,
        note: row.fit || null, tags: ['trend'], hook, angle: row.angle, bullets, brandIds: [row.customerId],
        topic: 'General', pillars: row.pillar ? [row.pillar] : [], format: '', status: 'NEW',
      });
      let claimed: boolean;
      try {
        claimed = await this._repo.claimIdea(orgId, trendId, idea.id);
      } catch (e) {
        await this._ideas.updateOp(orgId, idea.id, { deletedAt: new Date() });
        throw e;
      }
      if (!claimed) {
        await this._ideas.updateOp(orgId, idea.id, { deletedAt: new Date() });
        const again = await this._repo.row(orgId, trendId);
        if (again?.ideaId) return { ideaId: again.ideaId };
        throw new NotFoundException('Trend not found');
      }
      return { ideaId: idea.id };
    } finally {
      this._saving.delete(trendId);
    }
  }
}
// <<< SANAD-BRANDS
