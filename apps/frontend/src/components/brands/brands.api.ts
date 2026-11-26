'use client';
// >>> SANAD-BRANDS: typed calls to the /brands routes
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';

export interface Channel { id: string; name: string; provider: string; picture: string | null }
export interface BrandSummary { id: string; name: string; channels: Channel[]; role: BrandRole; requiresApproval: boolean }
export interface SectionData { content: string | null; rows: string[][] | null; note: string | null; updatedBy: string | null; updatedAt: string }
export interface BrandDetail extends BrandSummary { sections: Record<string, SectionData> }
export interface AccessPerson { userId: string; name: string; orgRole: string; access: 'VIEW' | 'CREATE' | 'APPROVE'; locked: boolean }

export const useBrandsApi = () => {
  const fetch = useFetch();
  const send = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { message?: string })?.message || `Request failed (${res.status})`);
    return data;
  }, [fetch]);
  return {
    list: () => send('/brands') as Promise<BrandSummary[]>,
    get: (id: string) => send(`/brands/${id}`) as Promise<BrandDetail>,
    saveText: (id: string, key: string, content: string) => send(`/brands/${id}/sections/${key}`, 'PUT', { content }),
    saveRows: (id: string, key: string, rows: string[][]) => send(`/brands/${id}/sections/${key}`, 'PUT', { rows }),
    access: (id: string) => send(`/brands/${id}/access`) as Promise<{ requiresApproval: boolean; people: AccessPerson[] }>,
    setAccess: (id: string, userId: string, role: string) => send(`/brands/${id}/access`, 'PUT', { userId, role }),
    setSettings: (id: string, requiresApproval: boolean) => send(`/brands/${id}/settings`, 'PUT', { requiresApproval }),
    importPlan: (id: string, html: string, dryRun: boolean) => send(`/brands/${id}/import`, 'POST', { html, dryRun }),
  };
};
// <<< SANAD-BRANDS
