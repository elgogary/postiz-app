'use client';
// >>> SANAD-BRANDS: Brands page shell (brand avatars, header, tabs). Prototype: docs/prototypes/postiz/brand-profile.
import { FC, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { canEdit, isRowSection, RowSectionKey } from '@gitroom/helpers/brands/brand.rules';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { BrandDetail, BrandSummary, useBrandsApi } from './brands.api';
import { BrandConnections } from './brand.connections';
import { BrandTextSection } from './brand.text.section';
import { BrandRowsSection } from './brand.rows.section';
import { BrandFocus } from './brand.focus';
import { BrandAccessModal } from './brand.access.modal';
import { BrandImportModal } from './brand.import.modal';

const TABS: [string, string][] = [
  ['overview', 'Overview'], ['summary', 'Summary'], ['voice', 'Voice'], ['bench', 'Benchmark'], ['focus', 'Focus'],
  ['routine', 'Engagement'], ['profile', 'Profile tips'], ['kpi', 'KPIs'], ['review', 'Before publishing'], ['history', 'Past posts'],
];
const COLORS = ['#3b5bdb', '#0b7285', '#2b8a3e', '#c2255c', '#e67700', '#5f3dc4'];
const initials = (name: string) => name.split(/\s+/).filter((w) => /\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const Brands: FC = () => {
  const t = useT();
  const api = useBrandsApi();
  const user = useUser();
  const modals = useModals();
  const { show } = useToaster();
  const router = useRouter();
  const params = useSearchParams();
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const current = params.get('brand') || brands?.[0]?.id || '';
  const tab = params.get('tab') || 'overview';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const go = useCallback((next: { brand?: string; tab?: string }) => {
    const q = new URLSearchParams({ brand: next.brand ?? current, tab: next.tab ?? 'overview' });
    router.replace(`/brands?${q.toString()}`);
  }, [current, router]);

  const load = useCallback(async () => {
    try {
      const list = await api.list();
      setBrands(list);
      const id = params.get('brand') || list[0]?.id;
      setBrand(id ? await api.get(id) : null);
    } catch (e) {
      show((e as Error).message, 'warning');
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  if (!brands) return <div className="p-[24px] text-customColor18">{t('loading', 'Loading…')}</div>;
  if (!brands.length) {
    return <div className="p-[24px] text-[14px] text-customColor18">{t('no_brands', 'No brands yet. Group your channels by brand: on a channel, open its menu and choose "Move / add to group".')}</div>;
  }

  const may = brand ? canEdit(brand.role) : false;
  const saveText = (key: string) => async (html: string) => { await api.saveText(current, key, html); await load(); };
  const saveRows = (key: string) => async (rows: string[][]) => { await api.saveRows(current, key, rows); await load(); };
  const label = (k: string) => t(k, TABS.find(([key]) => key === k)?.[1] || k);

  const body = () => {
    if (!brand) return null;
    if (tab === 'overview') return <BrandConnections brand={brand} go={(k) => go({ tab: k })} />;
    if (tab === 'summary') {
      return (
        <div className="flex flex-col gap-[24px]">
          <BrandRowsSection sectionKey="pillars" label={t('pillars', 'Pillars')} data={brand.sections.pillars} canEdit={may} onSave={saveRows('pillars')} />
          <BrandTextSection label={label('summary')} data={brand.sections.summary} canEdit={may} onSave={saveText('summary')} />
        </div>
      );
    }
    if (tab === 'focus') return <BrandFocus data={brand.sections.focus} canEdit={may} onSave={saveRows('focus')} />;
    if (isRowSection(tab)) return <BrandRowsSection sectionKey={tab as RowSectionKey} label={label(tab)} data={brand.sections[tab]} canEdit={may} onSave={saveRows(tab)} />;
    return <BrandTextSection label={label(tab)} data={brand.sections[tab]} canEdit={may} onSave={saveText(tab)} />;
  };

  return (
    <div className="flex flex-1 gap-[24px] p-[24px] bg-newBgColorInner">
      <nav aria-label={t('brands', 'Brands')} className="flex mobile:hidden flex-col gap-[4px] w-[56px] shrink-0">
        {brands.map((b, i) => (
          <button key={b.id} title={b.name} aria-label={b.name} aria-current={b.id === current} onClick={() => go({ brand: b.id })}
            className={`w-[48px] h-[48px] rounded-[8px] flex items-center justify-center border ${b.id === current ? 'border-[#612BD3] bg-sixth' : 'border-transparent'}`}>
            <span className="w-[32px] h-[32px] rounded-full text-white text-[12px] font-[700] flex items-center justify-center" style={{ background: COLORS[i % COLORS.length] }}>{initials(b.name)}</span>
          </button>
        ))}
      </nav>
      <section className="flex-1 min-w-0 flex flex-col gap-[16px]">
        <select aria-label={t('brand', 'Brand')} className="hidden mobile:block min-h-[44px] bg-input border border-fifth rounded-[8px] px-[8px]" value={current} onChange={(e) => go({ brand: e.target.value })}>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {brand && (
          <div className="flex items-center gap-[16px] flex-wrap">
            <div>
              <div className="text-[20px] font-[600]"><span className="text-customColor18 font-[500]">{t('brands', 'Brands')} /</span> {brand.name}</div>
              <div className="flex gap-[8px] items-center text-[13px] text-customColor18 mt-[8px] flex-wrap">
                <span>{brand.channels.map((c) => c.name).join(' · ')}</span>
                <span className="px-[8px] py-[4px] rounded-[6px] border border-fifth">{brand.requiresApproval ? t('posts_need_approval', 'Posts need approval') : t('no_approval_step', 'No approval step')}</span>
                <span className="px-[8px] py-[4px] rounded-[6px] border border-fifth">{brand.role === 'approve' ? t('you_approve', 'You approve') : brand.role === 'create' ? t('you_create', 'You create') : t('view_only', 'View only')}</span>
              </div>
            </div>
            {isAdmin && (
              <div className="ms-auto flex gap-[8px]">
                <button className="text-[13px] font-[600] px-[16px] h-[36px] rounded-[8px] border border-fifth" onClick={() => modals.openModal({
                  title: t('import_plan', 'Import plan'), closeOnClickOutside: true, closeOnEscape: true,
                  children: (close: () => void) => <BrandImportModal brandId={current} close={close} onDone={load} />,
                })}>{t('import_plan', 'Import plan')}</button>
                <button className="text-[13px] font-[600] px-[16px] h-[36px] rounded-[8px] border border-fifth" onClick={() => modals.openModal({
                  title: `${t('access_and_approval', 'Access and approval')} · ${brand.name}`, closeOnClickOutside: true, closeOnEscape: true,
                  children: (close: () => void) => <BrandAccessModal brandId={current} close={close} onSaved={load} />,
                })}>{t('access', 'Access')}</button>
              </div>
            )}
          </div>
        )}
        <div role="tablist" className="flex gap-[16px] border-b border-fifth overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
              className={`shrink-0 whitespace-nowrap py-[8px] text-[14px] border-b-2 ${tab === k ? 'border-[#612BD3] text-[#612BD3] font-[600]' : 'border-transparent'}`}>
              {t(k, l)}
            </button>
          ))}
        </div>
        {body()}
      </section>
    </div>
  );
};
// <<< SANAD-BRANDS
