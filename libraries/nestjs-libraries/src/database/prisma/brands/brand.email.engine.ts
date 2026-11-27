// >>> SANAD-BRANDS: the two outside systems behind the Email tab: the brand's Listmonk (its own login) and the sending
// relay's report (Brevo, one server-side key). Neither the login nor the key is ever logged or sent to the browser.
import { Logger } from '@nestjs/common';

export interface Login { url: string; username: string; password: string; from?: string; replyTo?: string }

const TIMEOUT_MS = 15000;
const PREVIEW_MAX = 2 * 1024 * 1024;
const log = new Logger('BrandEmailEngine');

// What may be logged about a failure: the status the engine answered or the error class, never a URL, login or address.
export const why = (e: unknown) =>
  e instanceof Error ? (/^(Listmonk|Relay) answered \d+$/.test(e.message) ? e.message : e.name) : 'unknown error';

export async function lmFetch(login: Login, path: string, init: RequestInit = {}): Promise<Response> {
  const auth = Buffer.from(`${login.username}:${login.password}`).toString('base64');
  const res = await fetch(login.url.replace(/\/+$/, '') + path, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}`, ...((init.headers as Record<string, string>) || {}) },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Listmonk answered ${res.status}`);
  return res;
}

export const lmJson = async (login: Login, path: string, init?: RequestInit) => (await lmFetch(login, path, init)).json();

// A campaign's HTML: only text/html, at most 2 MB.
export async function lmPreview(login: Login, id: number): Promise<string> {
  const res = await lmFetch(login, `/api/campaigns/${Number(id)}/preview`, { headers: { Accept: 'text/html' } });
  if (!(res.headers.get('content-type') || '').toLowerCase().includes('text/html')) throw new Error('Listmonk answered a preview that is not HTML');
  const reader = res.body?.getReader();
  if (!reader) return '';
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > PREVIEW_MAX) { await reader.cancel(); throw new Error('Listmonk answered a preview over 2 MB'); }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf-8');
}

export interface RelayReport {
  requests: number; delivered: number; hardBounces: number; softBounces: number; blocked: number;
  uniqueOpens: number; uniqueClicks: number; loadedByProxy: number;
}

export const relayOn = () => !!process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.length > 0;

const RECENT_MS = 10 * 60 * 1000;
const OLD_MS = 24 * 60 * 60 * 1000;
const FAIL_MS = 60 * 1000;
const DAY_MS = 86400000;
const WINDOW_DAYS = 90;
const MAX_CALLS = 5;
const cache = new Map<string, { until: number; value: RelayReport | null }>();
const inflight = new Map<string, Promise<RelayReport | null>>();
let running = 0;
const waiting: (() => void)[] = [];
export const clearRelayCache = () => { cache.clear(); inflight.clear(); };

const day = (d: Date) => d.toISOString().slice(0, 10);

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= MAX_CALLS) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await run(); } finally { running--; waiting.shift()?.(); }
}

async function ask(tag: string, start: Date): Promise<{ value: RelayReport | null; ttl: number }> {
  try {
    const today = new Date();
    const end = new Date(Math.min(start.getTime() + 30 * DAY_MS, today.getTime()));
    const from = new Date(start.getTime() - DAY_MS);
    const q = new URLSearchParams({ startDate: day(from), endDate: day(end < start ? start : end), tag });
    const res = await slot(() => fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?${q}`, {
      headers: { 'api-key': process.env.BREVO_API_KEY as string, accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
    if (!res.ok) throw new Error(`Relay answered ${res.status}`);
    const j = await res.json();
    const ttl = today.getTime() - start.getTime() < 7 * DAY_MS ? RECENT_MS : OLD_MS;
    if (!(Number(j.requests) > 0)) return { value: null, ttl };
    const n = (k: string) => Number(j[k]) || 0;
    return {
      ttl,
      value: {
        requests: n('requests'), delivered: n('delivered'), hardBounces: n('hardBounces'), softBounces: n('softBounces'),
        blocked: n('blocked'), uniqueOpens: n('uniqueOpens'), uniqueClicks: n('uniqueClicks'), loadedByProxy: n('loadedByProxy'),
      },
    };
  } catch (e) {
    log.warn(`Relay read failed: ${why(e)}`);
    return { value: null, ttl: FAIL_MS };
  }
}

// The report for one email's tag, from the day before it started to 30 days later (or today). Null when there is nothing
// to show or the email started more than 90 days ago (those keep the Listmonk numbers).
export async function relayReport(tag: string, startedAt: string): Promise<RelayReport | null> {
  if (!relayOn()) return null;
  const start = new Date(startedAt);
  if (!(Date.now() - start.getTime() < WINDOW_DAYS * DAY_MS)) return null;
  const hit = cache.get(tag);
  if (hit && hit.until > Date.now()) return hit.value;
  const pending = inflight.get(tag);
  if (pending) return pending;
  const p = ask(tag, start).then(({ value, ttl }) => {
    const now = Date.now();
    for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
    cache.set(tag, { until: now + ttl, value });
    return value;
  }).finally(() => inflight.delete(tag));
  inflight.set(tag, p);
  return p;
}
// <<< SANAD-BRANDS
