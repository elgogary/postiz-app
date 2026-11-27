// >>> SANAD-BRANDS: the two outside systems behind the Email tab: the brand's Listmonk (its own login) and the sending
// relay's report (Brevo, one server-side key). Neither the login nor the key is ever logged or sent to the browser.
export interface Login { url: string; username: string; password: string; from?: string; replyTo?: string }

const TIMEOUT_MS = 15000;

export async function lmFetch(login: Login, path: string, init: RequestInit = {}): Promise<Response> {
  const auth = Buffer.from(`${login.username}:${login.password}`).toString('base64');
  const res = await fetch(login.url.replace(/\/+$/, '') + path, {
    ...init,
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}`, ...((init.headers as Record<string, string>) || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Listmonk answered ${res.status}`);
  return res;
}

export const lmJson = async (login: Login, path: string, init?: RequestInit) => (await lmFetch(login, path, init)).json();

export interface RelayReport {
  requests: number; delivered: number; hardBounces: number; softBounces: number; blocked: number;
  uniqueOpens: number; uniqueClicks: number; loadedByProxy: number;
}

export const relayOn = () => !!process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.length > 0;

const CACHE_MS = 10 * 60 * 1000;
const FAIL_CACHE_MS = 60 * 1000;
const cache = new Map<string, { until: number; value: RelayReport | null }>();
export const clearRelayCache = () => cache.clear();

const day = (d: Date) => d.toISOString().slice(0, 10);

// The report for one email's tag, from its first day to 30 days later (or today). Null when there is nothing to show.
export async function relayReport(tag: string, startedAt: string): Promise<RelayReport | null> {
  if (!relayOn()) return null;
  const hit = cache.get(tag);
  if (hit && hit.until > Date.now()) return hit.value;
  let value: RelayReport | null = null;
  let ttl = CACHE_MS;
  try {
    const start = new Date(startedAt);
    const today = new Date();
    const end = new Date(Math.min(start.getTime() + 30 * 86400000, today.getTime()));
    const q = new URLSearchParams({ startDate: day(start), endDate: day(end < start ? start : end), tag });
    const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?${q}`, {
      headers: { 'api-key': process.env.BREVO_API_KEY as string, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Relay answered ${res.status}`);
    const j = await res.json();
    if (Number(j.requests) > 0) {
      const n = (k: string) => Number(j[k]) || 0;
      value = {
        requests: n('requests'), delivered: n('delivered'), hardBounces: n('hardBounces'), softBounces: n('softBounces'),
        blocked: n('blocked'), uniqueOpens: n('uniqueOpens'), uniqueClicks: n('uniqueClicks'), loadedByProxy: n('loadedByProxy'),
      };
    }
  } catch {
    ttl = FAIL_CACHE_MS;
  }
  cache.set(tag, { until: Date.now() + ttl, value });
  return value;
}
// <<< SANAD-BRANDS
