// >>> SANAD-BRANDS: trends: the two AI calls (plan the search, cluster what was found). Same client pattern as the first
// draft: the OpenAI SDK with OPENAI_API_KEY and OPENAI_BASE_URL, model BRANDS_AI_MODEL, else AGENT_AI_MODEL, else
// deepseek-chat. Any failure returns null and the brand is skipped. The log never carries the key or the answer.
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

export interface TrendPlan {
  language: 'ar' | 'en'; country: string; newsQueries: string[]; tech: boolean; githubQueries: string[];
  linkedinKeywords: string[]; tiktok: { country: string; industry: string } | null;
}
export interface PlanInput { brand: string; summary: string; voice: string; pillars: string[] }
export interface ClusterItem { id: string; kind: string; title: string; source: string; metric?: string }
export interface ClusterInput { brand: string; language: 'ar' | 'en'; pillars: string[]; items: ClusterItem[] }
export interface Cluster {
  title: string; kind: 'topic' | 'story'; pillar: string; countQuery: string; itemIds: string[];
  fit: string; hook: string; angle: string; bullets: string[];
}

export const MAX_NEWS_QUERIES = 4;
export const MAX_GITHUB_QUERIES = 3;
export const MAX_LINKEDIN_KEYWORDS = 3;
export const MAX_TOPICS = 10;

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 120) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const country = (v: unknown) => { const c = str(v, 10).toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : ''; };

const json = (text: string): unknown => {
  const t = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { return null; }
};

export function planPrompt(i: PlanInput) {
  const system = [
    'You plan the weekly trend search for one brand. Read its summary, voice and content pillars.',
    'Answer with one JSON object and nothing else, with these keys:',
    'language: "ar" or "en", the language the brand writes to its audience in.',
    'country: the two-letter code of the brand\'s main audience, for example SA, EG, AE, GB, US.',
    `newsQueries: at most ${MAX_NEWS_QUERIES} short news search phrases in that language, each on one subject the audience follows.`,
    'tech: true only when the audience follows software, AI or developer news, otherwise false.',
    `githubQueries: at most ${MAX_GITHUB_QUERIES} short English keywords to search new code repositories, empty unless tech is true.`,
    `linkedinKeywords: at most ${MAX_LINKEDIN_KEYWORDS} short keywords to search LinkedIn posts, in the language the audience posts in.`,
    'tiktok: {"country": two-letter code, "industry": one short English industry name} when the brand sells to consumers, otherwise null.',
  ].join('\n');
  const user = `Brand: ${i.brand}\n\nSummary:\n${i.summary}\n\nVoice:\n${i.voice}\n\nContent pillars:\n${i.pillars.map((p) => `- ${p}`).join('\n')}`;
  return { system, user };
}

export function parsePlan(text: string): TrendPlan | null {
  const o = json(text) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const newsQueries = strs(o.newsQueries, MAX_NEWS_QUERIES);
  if (!newsQueries.length) return null;
  const tech = o.tech === true;
  const t = o.tiktok as Record<string, unknown> | null;
  const tc = t && typeof t === 'object' ? country(t.country) : '';
  return {
    language: o.language === 'ar' ? 'ar' : 'en',
    country: country(o.country) || 'US',
    newsQueries,
    tech,
    githubQueries: tech ? strs(o.githubQueries, MAX_GITHUB_QUERIES) : [],
    linkedinKeywords: strs(o.linkedinKeywords, MAX_LINKEDIN_KEYWORDS),
    tiktok: tc ? { country: tc, industry: str(t?.industry, 60) } : null,
  };
}

export function clusterPrompt(i: ClusterInput) {
  const lang = i.language === 'ar' ? 'Arabic' : 'English';
  const system = [
    'You group what was found this week into the topics a brand can post about. Each found item has an id.',
    'Answer with one JSON object and nothing else: {"topics": [...]} with at most ' + MAX_TOPICS + ' topics, each:',
    'title: the topic in a few words.',
    'kind: "topic" for a subject many items cover, "story" for one single piece of news.',
    'pillar: one of the brand\'s content pillars, copied exactly as written. Leave out a topic that fits none of them.',
    'countQuery: a short news search phrase that finds this topic (used to count how many outlets cover it).',
    'itemIds: the ids of the found items that belong to this topic.',
    `fit: one sentence on why this suits the brand, in ${lang}.`,
    `hook: the opening line of a post on it, in ${lang}.`,
    `angle: the point of view the brand takes, in ${lang}.`,
    `bullets: exactly 3 short points the post makes, in ${lang}.`,
    'Use only what the items say. Never invent a number, a name or a quote.',
  ].join('\n');
  const user = `Brand: ${i.brand}\n\nContent pillars:\n${i.pillars.map((p) => `- ${p}`).join('\n')}\n\nFound items:\n` +
    i.items.map((x) => `${x.id} [${x.kind}] ${x.title}${x.source ? ` (${x.source})` : ''}${x.metric ? ` ${x.metric}` : ''}`).join('\n');
  return { system, user };
}

export function parseClusters(text: string): Cluster[] | null {
  const o = json(text) as { topics?: unknown } | unknown[] | null;
  const list = Array.isArray(o) ? o : o && typeof o === 'object' && Array.isArray(o.topics) ? o.topics : null;
  if (!list) return null;
  const out: Cluster[] = [];
  for (const raw of list) {
    const t = (raw || {}) as Record<string, unknown>;
    const title = str(t.title, 120);
    const hook = str(t.hook, 400);
    if (!title || !hook) continue;
    out.push({
      title, kind: t.kind === 'story' ? 'story' : 'topic', pillar: str(t.pillar, 120), countQuery: str(t.countQuery, 120) || title,
      itemIds: strs(t.itemIds, 30, 20), fit: str(t.fit, 400), hook, angle: str(t.angle, 600), bullets: strs(t.bullets, 3, 300),
    });
    if (out.length === MAX_TOPICS) break;
  }
  return out;
}

@Injectable()
export class TrendAi {
  private readonly _log = new Logger('TrendAi');

  async plan(input: PlanInput): Promise<TrendPlan | null> {
    const { system, user } = planPrompt(input);
    const text = await this.ask(system, user);
    const plan = text === null ? null : parsePlan(text);
    if (text !== null && !plan) this._log.warn('The AI search plan was not the JSON asked for');
    return plan;
  }

  async cluster(input: ClusterInput): Promise<Cluster[] | null> {
    const { system, user } = clusterPrompt(input);
    const text = await this.ask(system, user);
    const topics = text === null ? null : parseClusters(text);
    if (text !== null && !topics) this._log.warn('The AI topics were not the JSON asked for');
    return topics;
  }

  private async ask(system: string, user: string): Promise<string | null> {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'sk-proj-') return null;
    try {
      const client = new OpenAI({ apiKey: key, timeout: 40000, maxRetries: 0 });
      const res = await client.chat.completions.create({
        model: process.env.BRANDS_AI_MODEL || process.env.AGENT_AI_MODEL || 'deepseek-chat',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      });
      return res.choices?.[0]?.message?.content || '';
    } catch (e) {
      this._log.warn(`The AI call failed: ${(e as Error).name}`);
      return null;
    }
  }
}
// <<< SANAD-BRANDS
