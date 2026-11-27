// >>> SANAD-BRANDS: one read of a channel's Listmonk (its own lists, the campaigns on those lists, who unsubscribed),
// kept 60 s per channel and shared by everyone asking at the same moment.
import { Logger } from '@nestjs/common';
import { Login, lmJson, why } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.engine';
import { unsubscribesByCampaign } from '@gitroom/helpers/brands/email.rules';

export type LmList = { id: number; name: string; tags?: string[]; subscriber_count?: number; subscriber_statuses?: Record<string, number> };
export type LmCampaign = {
  id: number; name: string; subject: string; status: string; lists: { id: number; name: string }[]; started_at: string | null; updated_at: string;
  send_at: string | null; sent: number; views: number; clicks: number; from_email?: string;
};
// unsubs is null when the unsubscribe read failed: the numbers are then unknown, not zero.
export type Loaded = { campaigns: LmCampaign[]; lists: LmList[]; unsubs: Map<number, number> | null };

const CACHE_MS = 60 * 1000;
const PER_PAGE = 1000;
const MAX_PAGES = 10;
const log = new Logger('BrandEmailLoad');
const cache = new Map<string, { until: number; data: Promise<Loaded> }>();
export const clearLoadCache = (channelId?: string) => (channelId ? cache.delete(channelId) : cache.clear());

type Sub = { lists?: { id: number; subscription_status: string; subscription_updated_at: string }[] };

// At most 10 pages of 1000 per list; the count on the list comes from the list itself, only the attribution uses what was read.
async function unsubEvents(login: Login, listId: number) {
  const out: { listId: number; at: string }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await lmJson(login, `/api/subscribers?list_id=${listId}&subscription_status=unsubscribed&per_page=${PER_PAGE}&page=${page}`);
    const rows = (r.data?.results || []) as Sub[];
    for (const s of rows) {
      for (const y of s.lists || []) if (y.id === listId && y.subscription_status === 'unsubscribed') out.push({ listId, at: y.subscription_updated_at });
    }
    if (rows.length < PER_PAGE) break;
  }
  return out;
}

async function read(login: Login): Promise<Loaded> {
  const [c, l] = await Promise.all([
    lmJson(login, '/api/campaigns?per_page=all&no_body=true&order_by=created_at&order=desc'), lmJson(login, '/api/lists?per_page=all'),
  ]);
  const lists: LmList[] = l.data?.results || [];
  const own = new Set(lists.map((x) => x.id));
  const campaigns = ((c.data?.results || []) as LmCampaign[]).filter((k) => (k.lists || []).length > 0 && k.lists.every((y) => own.has(y.id)));
  let unsubs: Map<number, number> | null = null;
  try {
    const withUnsubs = lists.filter((x) => (x.subscriber_statuses?.unsubscribed || 0) > 0);
    const events = (await Promise.all(withUnsubs.map((x) => unsubEvents(login, x.id)))).flat();
    unsubs = unsubscribesByCampaign(campaigns.map((k) => ({ id: k.id, listIds: k.lists.map((y) => y.id), at: k.started_at })), events);
  } catch (e) {
    log.warn(`Unsubscribe read failed: ${why(e)}`);
  }
  return { campaigns, lists, unsubs };
}

export function loadChannel(channelId: string, login: Login): Promise<Loaded> {
  const hit = cache.get(channelId);
  if (hit && hit.until > Date.now()) return hit.data;
  const data = read(login);
  const entry = { until: Date.now() + CACHE_MS, data };
  cache.set(channelId, entry);
  data.catch(() => { if (cache.get(channelId) === entry) cache.delete(channelId); });
  return data;
}
// <<< SANAD-BRANDS
