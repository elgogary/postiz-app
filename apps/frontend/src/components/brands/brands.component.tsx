'use client';
// >>> SANAD-BRANDS: Brands page shell (brand avatars, header, tabs). Prototype: docs/prototypes/postiz/brand-profile.
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { canEdit, isRowSection, RowSectionKey } from '@gitroom/helpers/brands/brand.rules';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { BrandDetail, BrandSummary, errorText, useBrandsApi } from './brands.api';
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
  const [failed, setFailed] = useState(false);
  const current = params.get('brand') || brands?.[0]?.id || '';
  const tab = params.get('tab') || 'overview';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const go = useCallback((next: { brand?: string; tab?: string }) => {
    const q = new URLSearchParams({ brand: next.brand ?? current, tab: next.tab ?? 'overview' });
    router.replace(`/brands?${q.toString()}`);
  }, [current, router]);

  // Only the newest request may set state: a slow answer for a brand or tab left behind is dropped.
  const seq = useRef(0);
  const notify = useRef({ show, t });
  notify.current = { show, t };
  const wanted = params.get('brand') || '';
  // A reload started by a save in brand A must fetch the brand open now, not A: read the URL brand from a ref.
  const wantedRef = useRef(wanted);
  wantedRef.current = wanted;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = await api.list();
      const id = wantedRef.current || list[0]?.id;
      const detail = id ? await api.get(id) : null;
      if (mine !== seq.current) return;
      setBrands(list);
      setBrand(detail);
      setFailed(false);
    } catch (e) {
      if (mine !== seq.current) return;
      setBrands((b) => b ?? []);
      setFailed(true);
      notify.current.show(errorText(e, notify.current.t), 'warning');
    }
  }, [api]);

  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load, wanted]);

  if (!brands) return <div className="p-[24px] text-customColor18">{t('loading', 'Loading…')}</div>;
  if (failed && !brands.length) {
    return (
      <div className="p-[24px] flex items-center gap-[16px] text-[14px] text-customColor18">
        {t('brands_load_failed', 'Could not load brands.')}
        <button className="text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth" onClick={load}>{t('try_again', 'Try again')}</button>
      </div>
    );
  }
  if (!brands.length) {
    return <div className="p-[24px] text-[14px] text-customColor18">{t('no_brands', 'No brands yet. Group your channels by brand: on a channel, open its menu and choose "Move / add to group".')}</div>;
  }

  // The page shows a brand only once its own data is here; until then nothing of the previous brand is editable.
  const ready = brand && brand.id === current ? brand : null;
  const may = ready ? canEdit(ready.role) : false;
  const saveText = (id: string, key: string) => async (html: string) => { await api.saveText(id, key, html); await load(); };
  const saveRows = (id: string, key: string) => async (rows: string[][]) => { await api.saveRows(id, key, rows); await load(); };
  const label = (k: string) => t(k, TABS.find(([key]) => key === k)?.[1] || k);

  const body = () => {
    if (!ready) {
      return failed
        ? <button className="self-start text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth" onClick={load}>{t('try_again', 'Try again')}</button>
        : <div className="text-customColor18">{t('loading', 'Loading…')}</div>;
    }
    const b = ready;
    const key = `${b.id}:${tab}`;
    if (tab === 'overview') return <BrandConnections key={key} brand={b} go={(k) => go({ tab: k })} />;
    if (tab === 'summary') {
      return (
        <div key={key} className="flex flex-col gap-[24px]">
          <BrandRowsSection key={`${key}:pillars`} sectionKey="pillars" label={t('pillars', 'Pillars')} data={b.sections.pillars} canEdit={may} onSave={saveRows(b.id, 'pillars')} />
          <BrandTextSection key={`${key}:text`} label={label('summary')} data={b.sections.summary} canEdit={may} onSave={saveText(b.id, 'summary')} />
        </div>
      );
    }
    if (tab === 'focus') return <BrandFocus key={key} data={b.sections.focus} canEdit={may} onSave={saveRows(b.id, 'focus')} />;
    if (isRowSection(tab)) return <BrandRowsSection key={key} sectionKey={tab as RowSectionKey} label={label(tab)} data={b.sections[tab]} canEdit={may} onSave={saveRows(b.id, tab)} />;
    return <BrandTextSection key={key} label={label(tab)} data={b.sections[tab]} canEdit={may} onSave={saveText(b.id, tab)} />;
  };

  return (
    <div className="flex flex-1 min-w-0 max-w-full gap-[24px] p-[24px] [@media(max-width:480px)]:p-[12px] bg-newBgColorInner">
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
        {ready && (
          <div className="flex items-center gap-[16px] flex-wrap">
            <div>
              <div className="text-[20px] font-[600]"><span className="text-customColor18 font-[500]">{t('brands', 'Brands')} /</span> {ready.name}</div>
              <div className="flex gap-[8px] items-center text-[13px] text-customColor18 mt-[8px] flex-wrap">
                <span>{ready.channels.map((c) => c.name).join(' · ')}</span>
                <span className="px-[8px] py-[4px] rounded-[6px] border border-fifth">{ready.requiresApproval ? t('posts_need_approval', 'Posts need approval') : t('no_approval_step', 'No approval step')}</span>
                <span className="px-[8px] py-[4px] rounded-[6px] border border-fifth">{ready.role === 'approve' ? t('you_approve', 'You approve') : ready.role === 'create' ? t('you_create', 'You create') : t('view_only', 'View only')}</span>
              </div>
            </div>
            {isAdmin && (
              <div className="ms-auto flex gap-[8px]">
                <button className="text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth" onClick={() => modals.openModal({
                  title: t('import_plan', 'Import plan'), closeOnClickOutside: true, closeOnEscape: true,
                  children: (close: () => void) => <BrandImportModal brandId={ready.id} close={close} onDone={load} />,
                })}>{t('import_plan', 'Import plan')}</button>
                <button className="text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth" onClick={() => modals.openModal({
                  title: `${t('access_and_approval', 'Access and approval')} · ${ready.name}`, closeOnClickOutside: true, closeOnEscape: true,
                  children: (close: () => void) => <BrandAccessModal brandId={ready.id} close={close} onSaved={load} />,
                })}>{t('access', 'Access')}</button>
              </div>
            )}
          </div>
        )}
        <div role="tablist" className="flex gap-[16px] border-b border-fifth overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
              className={`shrink-0 whitespace-nowrap py-[8px] text-[14px] border-b-2 [@media(max-width:480px)]:min-h-[44px] [@media(max-width:480px)]:min-w-[44px] ${tab === k ? 'border-[#612BD3] text-[#612BD3] font-[600]' : 'border-transparent'}`}>
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
