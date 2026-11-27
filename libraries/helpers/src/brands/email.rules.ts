// >>> SANAD-BRANDS: a brand's Email tab. The answer shapes the backend sends and the frontend draws, and the pure rules
// behind them. Where each number comes from: sent, links clicked and unsubscribes from Listmonk (the engine); delivered,
// opened and clicked from the sending relay's report for the email's tag (Brevo), so rates match Brevo's way of counting.
// Without a relay report, opened and clicked fall back to Listmonk's counts over sent, and delivered is not shown.

export type ConsentKind = 'agreed' | 'team' | 'none';
export type CampaignState = 'scheduled' | 'sending' | 'paused' | 'cancelled' | 'sent' | 'draft';

export interface Rate { count: number; pct: number | null }

export interface EmailCampaignRow {
  channelId: string; id: number; name: string; subject: string; state: CampaignState; at: string | null;
  sentTo: number; opened: Rate | null; clicked: Rate | null; unsubscribed: Rate | null;
}
export interface EmailListRow {
  channelId: string; id: number; name: string; contacts: number; unsubscribed: number; consent: ConsentKind; lastEmail: string | null;
}
export interface EmailOverview {
  channels: { id: string; name: string }[];
  relay: 'brevo' | null;
  campaigns: EmailCampaignRow[];
  lists: EmailListRow[];
  failed: string[]; // channel names whose Listmonk could not be read
}
export type HistoryStep = 'sent_for_review' | 'approved' | 'sent' | 'finished';
export interface EmailReport {
  row: EmailCampaignRow;
  from: string;
  lists: { id: number; name: string }[];
  delivered: Rate | null;
  notDelivered: { hard: number; soft: number; blocked: number } | null;
  uncertainOpens: number | null; // opens a mail app's privacy proxy made by itself (Apple Mail), counted by the relay
  links: { url: string; clicks: number }[];
  history: { step: HistoryStep; by: string | null; at: string }[];
}
export interface EmailContact { email: string; name: string; status: 'subscribed' | 'unsubscribed' | 'unconfirmed' | 'blocklisted'; added: string }
export interface EmailContacts { contacts: EmailContact[]; total: number }

export const CONSENT_TAGS: Record<Exclude<ConsentKind, 'none'>, string> = { agreed: 'consent-agreed', team: 'consent-team' };
export const consentOf = (tags: string[] | null | undefined): ConsentKind =>
  tags?.includes(CONSENT_TAGS.team) ? 'team' : tags?.includes(CONSENT_TAGS.agreed) ? 'agreed' : 'none';

// The tag the Hub puts on every email it sends (X-Mailin-Tag header), so the relay's report can be read per email.
export const hubTag = (postId: string) => `hub-${postId}`;

// Postiz keeps the Listmonk campaign as releaseURL `<listmonk>/api/campaigns/<id>/preview`.
export const campaignIdFromRelease = (url: string | null | undefined): number | null => {
  const m = /\/api\/campaigns\/(\d+)\/preview$/.exec(url || '');
  return m ? +m[1] : null;
};

export const pct = (count: number, base: number | null | undefined): number | null =>
  base && base > 0 ? Math.round((10000 * count) / base) / 100 : null;
export const rate = (count: number, base: number | null | undefined): Rate => ({ count, pct: pct(count, base) });

const STATES: Record<string, CampaignState> = {
  draft: 'draft', scheduled: 'scheduled', running: 'sending', paused: 'paused', cancelled: 'cancelled', finished: 'sent',
};
export const campaignState = (listmonkStatus: string): CampaignState => STATES[listmonkStatus] || 'draft';

// Listmonk does not record which email an unsubscribe came from. Each unsubscribe is given to the latest campaign sent
// to that list at or before it: the email whose link the person most likely used. Campaigns that never started get none.
export function unsubscribesByCampaign(
  sends: { id: number; listIds: number[]; at: string | null }[],
  unsubs: { listId: number; at: string }[],
): Map<number, number> {
  const out = new Map<number, number>();
  const started = sends.filter((s) => s.at).map((s) => ({ ...s, t: Date.parse(s.at as string) }));
  for (const u of unsubs) {
    const t = Date.parse(u.at);
    let best: { id: number; t: number } | null = null;
    for (const s of started) {
      if (s.listIds.includes(u.listId) && s.t <= t && (!best || s.t > best.t)) best = s;
    }
    if (best) out.set(best.id, (out.get(best.id) || 0) + 1);
  }
  return out;
}

// --- contacts import: the file a person uploads, checked and rewritten for Listmonk with a consent record per row ---

export const IMPORT_MAX_ROWS = 5000;
const EMAIL = /^[^@\s<>",]+@[^@\s<>",]+\.[^@\s<>",]+$/;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

export interface ContactsFile { contacts: { email: string; name: string }[]; skipped: number; error: string | null }

// The first row may be a header naming an email column (and a name column); without one, the first cell holding an
// address is the email and the cell after it the name.
export function readContacts(text: string): ContactsFile {
  const rows = parseCsv(text);
  if (!rows.length) return { contacts: [], skipped: 0, error: 'The file is empty' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const named = head.findIndex((h) => h === 'email' || h === 'e-mail' || h === 'email address' || h === 'البريد الإلكتروني');
  const body = named >= 0 ? rows.slice(1) : rows;
  const nameAt = named >= 0 ? head.findIndex((h) => h === 'name' || h === 'full name' || h === 'الاسم') : -1;
  const seen = new Set<string>();
  const contacts: { email: string; name: string }[] = [];
  let skipped = 0;
  for (const r of body) {
    const at = named >= 0 ? named : r.findIndex((v) => EMAIL.test(v.trim()));
    const email = (r[at] || '').trim().toLowerCase();
    if (at < 0 || !EMAIL.test(email) || seen.has(email)) { skipped++; continue; }
    seen.add(email);
    const name = ((named >= 0 ? (nameAt >= 0 ? r[nameAt] : '') : r[at + 1]) || '').trim().slice(0, 200);
    contacts.push({ email, name });
  }
  if (!contacts.length) return { contacts, skipped, error: 'No email address found in the file' };
  if (contacts.length > IMPORT_MAX_ROWS) return { contacts: [], skipped, error: `At most ${IMPORT_MAX_ROWS} contacts per file` };
  return { contacts, skipped, error: null };
}

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

// Listmonk's import file: email, name, attributes (JSON), with who confirmed the agreement and when on every person.
export const listmonkImportCsv = (contacts: { email: string; name: string }[], by: { id: string; name: string }, at: string) =>
  ['email,name,attributes', ...contacts.map((c) =>
    [c.email, c.name || c.email.split('@')[0], JSON.stringify({ consent: { by: by.name, byId: by.id, at, source: 'hub-import' } })].map(csvCell).join(','),
  )].join('\n');
// <<< SANAD-BRANDS
