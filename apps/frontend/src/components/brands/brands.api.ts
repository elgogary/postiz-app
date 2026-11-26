'use client';
// >>> SANAD-BRANDS: typed calls to the /brands routes
import { useCallback, useMemo } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';
import type { Card } from '@gitroom/helpers/brands/post.rules';

export interface Channel { id: string; name: string; provider: string; picture: string | null }
export interface BrandSummary { id: string; name: string; channels: Channel[]; role: BrandRole; requiresApproval: boolean; waiting: number }
export interface SectionData { content: string | null; rows: string[][] | null; note: string | null; updatedBy: string | null; updatedAt: string }
export interface BrandDetail extends BrandSummary { sections: Record<string, SectionData> }
export interface ImportSummary { dryRun: boolean; sections: string[]; rows: Record<string, number>; posts: number; replaces: string[]; matched: number }
export interface AccessPerson { userId: string; name: string; orgRole: string; access: 'VIEW' | 'CREATE' | 'APPROVE'; locked: boolean }

export interface BrandPosts {
  window: { from: string; to: string }; role: BrandRole; requiresApproval: boolean; checks: number;
  channels: { id: string; name: string }[]; cards: Card[];
}
export interface PostComment { id: string; by: string; text: string; at: string; slide: number | null }

export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Arabic letters: base, supplement, extended-A, presentation forms A and B.
export const AR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const AR_ALL = new RegExp(AR.source, 'g');
// One rule for every text: right to left when at least a fifth of its letters are Arabic. Arabic sentences here
// carry many English terms (measured down to 25% Arabic letters), while an English line naming one Arabic person
// sits near 5%; empty or letterless text is left to right.
export const dirOf = (v: string) => {
  const ar = (v.match(AR_ALL) || []).length;
  const all = ar + (v.match(/[A-Za-z]/g) || []).length;
  return ar > 0 && ar * 5 >= all ? 'rtl' : 'ltr';
};

// A failed call carries the server's message when there is one, else only the status, so the toast can translate the fallback.
export class BrandsApiError extends Error {
  constructor(message: string, public status: number, public fromServer: boolean) { super(message); }
}
export const errorText = (e: unknown, t: (k: string, d: string) => unknown) => {
  const err = e as BrandsApiError;
  return err.fromServer || err.status === undefined ? err.message : `${t('request_failed', 'Request failed')} (${err.status})`;
};

export const useBrandsApi = () => {
  const fetch = useFetch();
  const send = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { message?: string })?.message;
      throw new BrandsApiError(msg || String(res.status), res.status, !!msg);
    }
    return data;
  }, [fetch]);
  return useMemo(() => ({
    list: () => send('/brands') as Promise<BrandSummary[]>,
    get: (id: string) => send(`/brands/${id}`) as Promise<BrandDetail>,
    saveText: (id: string, key: string, content: string) => send(`/brands/${id}/sections/${key}`, 'PUT', { content }),
    saveRows: (id: string, key: string, rows: string[][]) => send(`/brands/${id}/sections/${key}`, 'PUT', { rows }),
    access: (id: string) => send(`/brands/${id}/access`) as Promise<{ requiresApproval: boolean; people: AccessPerson[] }>,
    setAccess: (id: string, userId: string, role: string) => send(`/brands/${id}/access`, 'PUT', { userId, role }),
    setSettings: (id: string, requiresApproval: boolean) => send(`/brands/${id}/settings`, 'PUT', { requiresApproval }),
    importPlan: (id: string, html: string, dryRun: boolean) => send(`/brands/${id}/import`, 'POST', { html, dryRun, tzOffset: new Date().getTimezoneOffset() }) as Promise<ImportSummary>,
    posts: (id: string) => send(`/brands/${id}/posts`) as Promise<BrandPosts>,
    createDraft: (id: string, briefId: string, date: string) => send(`/brands/${id}/briefs/${briefId}/draft`, 'POST', { date }) as Promise<{ postId: string }>,
    briefDate: (id: string, briefId: string, date: string) => send(`/brands/${id}/briefs/${briefId}/date`, 'PUT', { date }),
    review: (id: string, postId: string) => send(`/brands/${id}/posts/${postId}/review`, 'POST', {}),
    approve: (id: string, postId: string, own: boolean, list: boolean) => send(`/brands/${id}/posts/${postId}/approve`, 'POST', { own, list }),
    sendBack: (id: string, postId: string, reason: string) => send(`/brands/${id}/posts/${postId}/send-back`, 'POST', { reason }),
    stop: (id: string, postId: string) => send(`/brands/${id}/posts/${postId}/stop`, 'POST', {}),
    schedule: (id: string, postId: string) => send(`/brands/${id}/posts/${postId}/schedule`, 'POST', {}),
    published: (id: string, postId: string) => send(`/brands/${id}/posts/${postId}/published`, 'POST', {}),
    postDate: (id: string, postId: string, date: string) => send(`/brands/${id}/posts/${postId}/date`, 'PUT', { date }),
    comments: (id: string, postId: string) => send(`/brands/${id}/posts/${postId}/comments`) as Promise<PostComment[]>,
    addComment: (id: string, postId: string, content: string, slide?: number) =>
      send(`/brands/${id}/posts/${postId}/comments`, 'POST', { content, ...(slide ? { slide } : {}) }) as Promise<{ id: string }>,
  }), [send]);
};
// <<< SANAD-BRANDS
