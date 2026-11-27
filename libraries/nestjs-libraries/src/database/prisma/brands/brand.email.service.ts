// >>> SANAD-BRANDS: a brand's Email tab. Rights come from BrandsService.context (any member reads; contacts and import
// are for approvers). Numbers come from the brand's own Listmonk and, when a relay key is set, the relay's report per email.
import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BrandsService } from '@gitroom/nestjs-libraries/database/prisma/brands/brands.service';
import { BrandEmailRepository } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.repository';
import { Login, RelayReport, lmFetch, lmJson, lmPreview, relayOn, relayReport, why } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.engine';
import { LmCampaign, LmList, clearLoadCache, loadChannel } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.load';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { OrgRole, isOrgAdmin } from '@gitroom/helpers/brands/brand.rules';
import {
  EmailCampaignRow, EmailContacts, EmailListRow, EmailOverview, EmailReport, HistoryStep, campaignIdFromRelease, campaignState,
  HISTORY_CHANNEL, consentOf, hubTag, listmonkImportCsv, rate, readContacts, sourceOf,
} from '@gitroom/helpers/brands/email.rules';
import { HistoryInput, checkImportBody, historyCampaignRow, historyReport, readBrevoCampaign } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.email.history';

type Channel = { id: string; name: string; customInstanceDetails: string | null };
type Relay = { postId: string; report: RelayReport | null };
const MAX_FILE = 5 * 1024 * 1024;
const PAGE = 50;
const DOWN = 'The email engine did not answer';

@Injectable()
export class BrandEmailService {
  pollMs = 1000;
  private readonly _log = new Logger('BrandEmailService');
  constructor(private _brands: BrandsService, private _repo: BrandEmailRepository) {}

  protected login(raw: string | null): Login {
    return JSON.parse(AuthService.fixedDecryption(raw!));
  }

  private async engine<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (e) {
      if (e instanceof HttpException) throw e;
      this._log.warn(`Email engine failed: ${why(e)}`);
      throw new HttpException(DOWN, 502);
    }
  }

  // A stored login that cannot be read is the same 502 as an engine that does not answer.
  private open(ch: Channel): Login {
    try {
      const l = this.login(ch.customInstanceDetails);
      if (typeof l?.url !== 'string' || !/^https?:\/\//.test(l.url)) throw new Error('bad login');
      return l;
    } catch (e) {
      this._log.warn(`Stored login unreadable: ${why(e)}`);
      throw new HttpException(DOWN, 502);
    }
  }

  private async channel(orgId: string, customerId: string, channelId: string) {
    const ch = (await this._repo.emailChannels(orgId, customerId)).find((c) => c.id === channelId);
    if (!ch) throw new NotFoundException('Email channel not found');
    return { ch, login: this.open(ch) };
  }

  // The relay's report per started campaign, found through the Post the Hub made it from (tag hub-<postId>).
  private async relays(orgId: string, ch: Channel, login: Login, campaigns: LmCampaign[]) {
    const out = new Map<number, Relay>();
    const started = campaigns.filter((k) => k.started_at);
    if (!relayOn() || !started.length) return out;
    const urls = started.map((k) => `${login.url}/api/campaigns/${k.id}/preview`);
    const posts = await this._repo.postsByRelease(orgId, ch.id, urls);
    await Promise.all(posts.map(async (p) => {
      const id = campaignIdFromRelease(p.releaseURL);
      const k = started.find((x) => x.id === id);
      if (k) out.set(k.id, { postId: p.id, report: await relayReport(hubTag(p.id), k.started_at as string) });
    }));
    return out;
  }

  private row(channelId: string, k: LmCampaign, unsubs: Map<number, number> | null, rep: RelayReport | null): EmailCampaignRow {
    const state = campaignState(k.status);
    const at = state === 'sent' || state === 'sending' ? k.started_at : state === 'scheduled' ? k.send_at : k.updated_at;
    const sentTo = k.sent || 0;
    const base = rep ? rep.delivered : sentTo;
    const live = !!k.started_at;
    return {
      channelId, id: k.id, name: k.name, subject: k.subject, state, at: at || k.updated_at || null, sentTo,
      opened: live ? (rep ? rate(rep.uniqueOpens, base) : rate(k.views || 0, sentTo)) : null,
      clicked: live ? (rep ? rate(rep.uniqueClicks, base) : rate(k.clicks || 0, sentTo)) : null,
      unsubscribed: live && unsubs ? rate(unsubs.get(k.id) || 0, base) : null,
    };
  }

  async overview(orgId: string, userId: string, orgRole: OrgRole, customerId: string): Promise<EmailOverview> {
    await this._brands.context(orgId, userId, orgRole, customerId);
    const channels = await this._repo.emailChannels(orgId, customerId);
    const history = await this._repo.history(orgId, customerId).catch((e) => {
      this._log.warn(`Earlier campaigns not read: ${why(e)}`);
      return [];
    });
    const done = await Promise.all(channels.map(async (ch) => {
      try {
        const login = this.open(ch);
        const data = await loadChannel(ch.id, login);
        const relays = await this.relays(orgId, ch, login, data.campaigns);
        const campaigns = data.campaigns.map((k) => this.row(ch.id, k, data.unsubs, relays.get(k.id)?.report || null));
        const lists: EmailListRow[] = data.lists.map((x) => {
          const unsub = x.subscriber_statuses?.unsubscribed || 0;
          const used = data.campaigns.filter((k) => k.started_at && (k.lists || []).some((y) => y.id === x.id)).map((k) => k.started_at as string);
          return {
            channelId: ch.id, id: x.id, name: x.name, contacts: Math.max(0, (x.subscriber_count || 0) - unsub), unsubscribed: unsub,
            consent: consentOf(x.tags), source: sourceOf(x.tags),
            lastEmail: used.concat(history.filter((h) => h.listIds.includes(x.id)).map((h) => h.sentAt.toISOString()))
              .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null,
          };
        });
        return { ch, campaigns, lists, ok: true };
      } catch (e) {
        this._log.warn(`Overview of a channel failed: ${why(e)}`);
        return { ch, campaigns: [] as EmailCampaignRow[], lists: [] as EmailListRow[], ok: false };
      }
    }));
    return {
      channels: channels.map((c) => ({ id: c.id, name: c.name })),
      relay: relayOn() ? 'brevo' : null,
      campaigns: done.flatMap((d) => d.campaigns).concat(history.map(historyCampaignRow)).sort((a, b) => Date.parse(b.at || '') - Date.parse(a.at || '')),
      lists: done.flatMap((d) => d.lists),
      failed: done.filter((d) => !d.ok).map((d) => d.ch.name),
    };
  }

  async report(orgId: string, userId: string, orgRole: OrgRole, customerId: string, channelId: string, id: number): Promise<EmailReport> {
    await this._brands.context(orgId, userId, orgRole, customerId);
    if (channelId === HISTORY_CHANNEL) return historyReport(await this.historyRow(orgId, customerId, id));
    const { ch, login } = await this.channel(orgId, customerId, channelId);
    return this.engine(async () => {
      const data = await loadChannel(ch.id, login);
      const k = data.campaigns.find((x) => x.id === id);
      if (!k) throw new NotFoundException('Campaign not found');
      const relay = (await this.relays(orgId, ch, login, [k])).get(k.id);
      const rep = relay?.report || null;
      const today = new Date().toISOString().slice(0, 10);
      const links = k.started_at
        ? await lmJson(login, `/api/campaigns/analytics/links?id=${k.id}&from=${k.started_at.slice(0, 10)}&to=${today}`).catch(() => ({ data: [] }))
        : { data: [] };
      const brief = relay ? (await this._repo.briefsByPost([relay.postId]))[0] : undefined;
      const names = await this._repo.userNames([brief?.sentById, brief?.decidedById].filter(Boolean) as string[]);
      const steps: { step: HistoryStep; by: string | null; at: string | null }[] = [
        { step: 'sent_for_review', by: names.get(brief?.sentById || '') || null, at: brief?.sentById && brief.sentAt ? brief.sentAt.toISOString() : null },
        { step: 'approved', by: names.get(brief?.decidedById || '') || null, at: brief?.review === 'APPROVED' && brief.decidedAt ? brief.decidedAt.toISOString() : null },
        { step: 'sent', by: null, at: k.started_at },
        { step: 'finished', by: null, at: k.status === 'finished' ? k.updated_at : null },
      ];
      return {
        row: this.row(ch.id, k, (await loadChannel(ch.id, login)).unsubs, rep),
        from: k.from_email || '',
        lists: (k.lists || []).map((y) => ({ id: y.id, name: y.name })),
        delivered: rep ? rate(rep.delivered, rep.requests) : null,
        notDelivered: rep ? { hard: rep.hardBounces, soft: rep.softBounces, blocked: rep.blocked } : null,
        uncertainOpens: rep ? rep.loadedByProxy : null,
        links: ((links.data || []) as { url: string; count: number }[]).map((x) => ({ url: x.url, clicks: x.count || 0 })).sort((a, b) => b.clicks - a.clicks),
        history: steps.filter((s) => s.at).map((s) => ({ step: s.step, by: s.by, at: s.at as string }))
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
      };
    });
  }

  async preview(orgId: string, userId: string, orgRole: OrgRole, customerId: string, channelId: string, id: number) {
    await this._brands.context(orgId, userId, orgRole, customerId);
    if (channelId === HISTORY_CHANNEL) return { html: (await this.historyRow(orgId, customerId, id)).html || '' };
    const { ch, login } = await this.channel(orgId, customerId, channelId);
    return this.engine(async () => {
      if (!(await loadChannel(ch.id, login)).campaigns.some((x) => x.id === id)) throw new NotFoundException('Campaign not found');
      return { html: await lmPreview(login, id) };
    });
  }

  private async historyRow(orgId: string, customerId: string, id: number) {
    const h = await this._repo.historyOne(orgId, customerId, String(id));
    if (!h) throw new NotFoundException('Campaign not found');
    return h;
  }

  // One-time move of a brand's Brevo campaigns into the Hub (org admin). Every campaign is read before any is stored.
  async importHistory(orgId: string, userId: string, orgRole: OrgRole, customerId: string, campaignIds: unknown, listMap: unknown) {
    await this._brands.context(orgId, userId, orgRole, customerId);
    if (!isOrgAdmin(orgRole)) throw new ForbiddenException('Only an admin can bring over earlier campaigns');
    // the relay key belongs to one account: only the organization that owns it may read its campaigns
    const owner = process.env.BREVO_ORG_ID && process.env.BREVO_ORG_ID.length > 0 ? process.env.BREVO_ORG_ID : null;
    if (owner !== orgId) throw new ForbiddenException('The sending relay account on this server belongs to another organization');
    const { ids, map } = checkImportBody(campaignIds, listMap);
    const own = new Set<number>();
    for (const ch of await this._repo.emailChannels(orgId, customerId)) {
      clearLoadCache(ch.id);
      try { (await loadChannel(ch.id, this.open(ch))).lists.forEach((x) => own.add(x.id)); } catch (e) {
        if (e instanceof HttpException) throw e;
        this._log.warn(`Lists of a channel not read: ${why(e)}`);
        throw new HttpException(DOWN, 502);
      }
    }
    const names = new Map<number, string>();
    const rows: HistoryInput[] = [];
    for (const id of ids) rows.push(await readBrevoCampaign(id, map, own, names));
    for (const r of rows) {
      const had = await this._repo.historyAnyBrand(orgId, r.sourceId);
      if (had && had.customerId !== customerId) throw new BadRequestException(`Campaign ${r.sourceId} was already brought over for another brand`);
    }
    for (const r of rows) await this._repo.saveHistory(orgId, customerId, userId, r);
    return { imported: rows.length, campaigns: rows.map((r) => ({ id: Number(r.sourceId), name: r.name })) };
  }

  private async approverList(orgId: string, userId: string, orgRole: OrgRole, customerId: string, channelId: string, listId: number) {
    const ctx = await this._brands.context(orgId, userId, orgRole, customerId);
    if (ctx.role !== 'approve') throw new ForbiddenException('Only an approver of this brand can see or add contacts');
    const found = await this.channel(orgId, customerId, channelId);
    if (!Number.isInteger(listId)) throw new NotFoundException('List not found');
    return { ...found, brand: ctx.customer.name as string };
  }

  private async mustHaveList(login: Login, listId: number) {
    const l = await lmJson(login, '/api/lists?per_page=all');
    if (!((l.data?.results || []) as LmList[]).some((x) => x.id === listId)) throw new NotFoundException('List not found');
  }

  async contacts(orgId: string, userId: string, orgRole: OrgRole, customerId: string, channelId: string, listId: number, page: number): Promise<EmailContacts> {
    const { login } = await this.approverList(orgId, userId, orgRole, customerId, channelId, listId);
    const p = Math.max(1, Math.floor(Number(page)) || 1);
    return this.engine(async () => {
      await this.mustHaveList(login, listId);
      const r = await lmJson(login, `/api/subscribers?list_id=${listId}&page=${p}&per_page=${PAGE}`);
      const MAP: Record<string, 'subscribed' | 'unconfirmed' | 'unsubscribed'> = { confirmed: 'subscribed', unconfirmed: 'unconfirmed', unsubscribed: 'unsubscribed' };
      type Sub = { email: string; name: string; status: string; lists?: { id: number; subscription_status: string; subscription_created_at: string }[] };
      return {
        total: r.data?.total || 0,
        contacts: ((r.data?.results || []) as Sub[]).map((s) => {
          const m = (s.lists || []).find((y) => y.id === listId);
          return {
            email: s.email, name: s.name || '', added: m?.subscription_created_at || '',
            status: s.status === 'blocklisted' ? 'blocklisted' as const : MAP[m?.subscription_status || ''] || 'subscribed' as const,
          };
        }),
      };
    });
  }

  async importContacts(orgId: string, userId: string, orgRole: OrgRole, customerId: string, channelId: string, listId: number,
    file: { buffer: Buffer; size?: number } | undefined, agreed: boolean) {
    const { login, brand } = await this.approverList(orgId, userId, orgRole, customerId, channelId, listId);
    if (agreed !== true) throw new BadRequestException(`Tick that these people agreed to hear from ${brand}`);
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to import');
    if (file.buffer.length > MAX_FILE) throw new BadRequestException('The file is larger than 5 MB');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer); } catch { throw new BadRequestException('The file must be text in UTF-8'); }
    const parsed = readContacts(text);
    if (parsed.error) throw new BadRequestException(parsed.error);
    const who = { id: userId, name: (await this._repo.userNames([userId])).get(userId) || userId };
    return this.engine(async () => {
      await this.mustHaveList(login, listId);
      const state = async () => (await lmJson(login, '/api/import/subscribers')).data || {};
      if ((await state()).status === 'importing') throw new BadRequestException('Another import is running, try again in a minute');
      const form = new FormData();
      form.append('params', JSON.stringify({ mode: 'subscribe', subscription_status: 'confirmed', delim: ',', lists: [listId], overwrite: false }));
      form.append('file', new Blob([listmonkImportCsv(parsed.contacts, who, new Date().toISOString())], { type: 'text/csv' }), 'contacts.csv');
      clearLoadCache(channelId);
      await lmFetch(login, '/api/import/subscribers', { method: 'POST', body: form });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, this.pollMs));
        const s = await state();
        if (s.status === 'failed') throw new BadRequestException('The import failed in the email engine');
        if (s.status === 'finished') {
          clearLoadCache(channelId);
          // Listmonk's imported counts every person it processed, new or already on the list, so the two cannot be told apart.
          return { processed: Number(s.imported) || 0, skipped: parsed.skipped };
        }
      }
      throw new BadRequestException('The import is still running, check the list in a minute');
    });
  }
}
// <<< SANAD-BRANDS
