// >>> SANAD-BRANDS: campaigns a brand sent before the Hub (from Brevo), kept in the Hub's own table. They are read once from
// Brevo with the server key, stored as Brevo counted them (not reconciled), and shown like any other started campaign.
import { BadRequestException, HttpException } from '@nestjs/common';
import { EmailCampaignRow, EmailReport, HISTORY_CHANNEL, rate } from '@gitroom/helpers/brands/email.rules';
import { relayOn, why } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.engine';

export interface HistoryRow {
  sourceId: string; name: string; subject: string; sender: string; sentAt: Date; listIds: number[]; listNames: string[];
  sent: number; delivered: number; hardBounces: number; softBounces: number; opens: number; uncertainOpens: number;
  clicks: number; unsubscribed: number; links: unknown; html: string | null;
}
export type HistoryInput = Omit<HistoryRow, 'sourceId'> & { sourceId: string };

const BREVO = 'https://api.brevo.com/v3';
const TIMEOUT_MS = 15000;
export const MAX_CAMPAIGNS = 50;

type BrevoCampaign = {
  name?: string; subject?: string; sender?: { email?: string }; sentDate?: string; status?: string; htmlContent?: string;
  recipients?: { lists?: number[] };
  statistics?: { globalStats?: Record<string, number>; linksStats?: Record<string, number> };
};

async function brevo<T>(path: string): Promise<T | null> {
  const res = await fetch(BREVO + path, {
    headers: { 'api-key': process.env.BREVO_API_KEY as string, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Relay answered ${res.status}`);
  return res.json() as Promise<T>;
}

const n = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);

// The ids the caller may bring over: whole numbers, at most MAX_CAMPAIGNS, no repeats.
export function checkImportBody(campaignIds: unknown, listMap: unknown): { ids: number[]; map: Map<number, number> } {
  if (!Array.isArray(campaignIds) || !campaignIds.length || campaignIds.length > MAX_CAMPAIGNS || !campaignIds.every((x) => Number.isInteger(x) && x > 0)) {
    throw new BadRequestException(`Send between 1 and ${MAX_CAMPAIGNS} campaign ids`);
  }
  if (!listMap || typeof listMap !== 'object' || Array.isArray(listMap)) throw new BadRequestException('listMap must map Brevo list ids to list ids');
  const map = new Map<number, number>();
  for (const [k, v] of Object.entries(listMap as Record<string, unknown>)) {
    if (!/^\d+$/.test(k) || !Number.isInteger(v)) throw new BadRequestException('listMap must map Brevo list ids to list ids');
    map.set(+k, v as number);
  }
  return { ids: [...new Set(campaignIds as number[])], map };
}

// One sent campaign from Brevo as a table row. Any failure other than "not sent" is a 502, never the key or the address.
export async function readBrevoCampaign(id: number, map: Map<number, number>, own: Set<number>, names: Map<number, string>): Promise<HistoryInput> {
  if (!relayOn()) throw new BadRequestException('The sending relay is not set up on this server');
  try {
    const c = await brevo<BrevoCampaign>(`/emailCampaigns/${id}?statistics=globalStats`);
    if (!c) throw new BadRequestException(`Campaign ${id} was not found`);
    if (c.status !== 'sent') throw new BadRequestException(`Campaign ${id} was not sent (status ${c.status || 'unknown'}), only sent campaigns come over`);
    const sentAt = new Date(c.sentDate || '');
    if (Number.isNaN(sentAt.getTime())) throw new BadRequestException(`Campaign ${id} has no send date`);
    const links = (await brevo<BrevoCampaign>(`/emailCampaigns/${id}?statistics=linksStats`))?.statistics?.linksStats || {};
    const g = c.statistics?.globalStats || {};
    const listIds: number[] = [];
    const listNames: string[] = [];
    for (const b of c.recipients?.lists || []) {
      const to = map.get(b);
      if (to === undefined || !own.has(to)) continue;
      if (!names.has(b)) names.set(b, (await brevo<{ name?: string }>(`/contacts/lists/${b}`))?.name || `List ${b}`);
      listIds.push(to);
      listNames.push(names.get(b) as string);
    }
    return {
      sourceId: String(id), name: String(c.name || c.subject || `Campaign ${id}`).slice(0, 200), subject: String(c.subject || '').slice(0, 500),
      sender: c.sender?.email || '', sentAt, listIds, listNames,
      sent: n(g.sent), delivered: n(g.delivered), hardBounces: n(g.hardBounces), softBounces: n(g.softBounces),
      opens: n(g.uniqueViews), uncertainOpens: n(g.appleMppOpens), clicks: n(g.uniqueClicks), unsubscribed: n(g.unsubscriptions),
      links: Object.entries(links).map(([url, clicks]) => ({ url, clicks: n(clicks) })), html: c.htmlContent || null,
    };
  } catch (e) {
    if (e instanceof HttpException) throw e;
    throw new HttpException(`Brevo did not answer for campaign ${id} (${why(e)})`, 502);
  }
}

export const historyCampaignRow = (h: HistoryRow): EmailCampaignRow => ({
  channelId: HISTORY_CHANNEL, id: Number(h.sourceId), name: h.name, subject: h.subject, state: 'sent', at: h.sentAt.toISOString(), sentTo: h.sent,
  opened: rate(h.opens, h.delivered), clicked: rate(h.clicks, h.delivered), unsubscribed: rate(h.unsubscribed, h.delivered),
});

export const historyReport = (h: HistoryRow): EmailReport => ({
  row: historyCampaignRow(h),
  from: h.sender,
  lists: h.listIds.map((id, i) => ({ id, name: h.listNames[i] || '' })),
  delivered: rate(h.delivered, h.sent),
  notDelivered: { hard: h.hardBounces, soft: h.softBounces, blocked: 0 },
  uncertainOpens: h.uncertainOpens,
  links: ((Array.isArray(h.links) ? h.links : []) as { url: string; clicks: number }[]).map((x) => ({ url: x.url, clicks: x.clicks })).sort((a, b) => b.clicks - a.clicks),
  history: [{ step: 'sent_before_hub', by: null, at: h.sentAt.toISOString() }],
});
// <<< SANAD-BRANDS
