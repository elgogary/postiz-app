'use client';
// >>> SANAD-BRANDS: the ideas list shared by a brand's Ideas tab (scope = the brand) and the Idea Bank page (scope =
// all, with a brand filter including No brand). Status filter New / In plan / Posted / Dropped / All (default New);
// counts follow the topic, brand and search filters.
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import type { IdeaStatus, IdeaView } from '@gitroom/helpers/brands/idea.rules';
import { IdeasData, dirOf, errorText, useBrandsApi } from './brands.api';
import { IdeaForm } from './idea.form';
import { IdeaPlan } from './idea.plan';

const STATUSES: (IdeaStatus | 'ALL')[] = ['NEW', 'PLANNED', 'POSTED', 'DROPPED', 'ALL'];
const LABEL: Record<string, string> = { NEW: 'New', PLANNED: 'In plan', POSTED: 'Posted', DROPPED: 'Dropped', ALL: 'All' };
const COLORS = ['#3b5bdb', '#0b7285', '#2b8a3e', '#c2255c', '#b35c00', '#5f3dc4'];
const initials = (name: string) => name.split(/\s+/).filter((w) => /\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const QUIET = 'text-[13px] px-[12px] h-[32px] [@media(max-width:480px)]:h-[44px] rounded-[6px] border border-fifth';

export const IdeasList: FC<{ scope: string }> = ({ scope }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const modals = useModals();
  const router = useRouter();
  const [data, setData] = useState<IdeasData | null>(null);
  const [status, setStatus] = useState<IdeaStatus | 'ALL'>('NEW');
  const [topic, setTopic] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [failed, setFailed] = useState('');
  const [busyId, setBusyId] = useState('');
  const seq = useRef(0);
  const brandId = scope === 'all' ? null : scope;

  const load = useCallback(() => {
    const mine = ++seq.current;
    return api.ideas(scope).then((d) => { if (mine === seq.current) { setData(d); setFailed(''); } })
      .catch((e) => { if (mine === seq.current) { const m = errorText(e, t); setFailed(m); show(m, 'warning'); } });
  }, [api, scope]);
  useEffect(() => { load(); }, [load]);

  const pool = useMemo(() => (data?.ideas || []).filter((i) =>
    (!topic || i.topic === topic)
    && (!brandFilter || (brandFilter === 'none' ? i.brandIds.length === 0 : i.brandIds.includes(brandFilter)))
    && (!q.trim() || `${i.hook} ${i.angle}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, topic, brandFilter, q]);
  if (!data && failed) return (
    <div className="flex flex-wrap items-center gap-[8px] text-[13px]">
      <span className="text-customColor18">{failed}</span>
      <button className={QUIET} onClick={() => { setFailed(''); load(); }}>{t('retry', 'Retry')}</button>
    </div>
  );
  if (!data) return <div className="text-customColor18">{t('loading', 'Loading…')}</div>;

  const roleOf = (id: string) => data.brands.find((b) => b.id === id)?.role;
  const writes = (ids: string[]) => (ids.length ? ids : data.brands.map((b) => b.id)).some((id) => ['create', 'approve'].includes(roleOf(id) || ''));
  const canAdd = brandId ? writes([brandId]) : writes([]);
  const shown = status === 'ALL' ? pool : pool.filter((i) => i.status === status);
  const count = (s: string) => (s === 'ALL' ? pool.length : pool.filter((i) => i.status === s).length);
  const form = (idea: IdeaView | null) => modals.openModal({
    title: idea ? t('edit_idea', 'Edit idea') : t('new_idea', 'New idea'), closeOnClickOutside: false, closeOnEscape: true,
    children: (close: () => void) => <IdeaForm data={data} idea={idea} brandId={brandId} close={close} onDone={load} />,
  });
  const plan = (idea: IdeaView) => modals.openModal({
    title: t('plan_this_idea', 'Plan this idea'), closeOnClickOutside: false, closeOnEscape: true,
    children: (close: () => void) => <IdeaPlan data={data} idea={idea} brandId={brandId} close={close} onDone={load} />,
  });
  const setIdeaStatus = async (idea: IdeaView, next: 'DROPPED' | 'NEW') => {
    setBusyId(idea.id);
    try { await api.ideaStatus(idea.id, next); show(next === 'DROPPED' ? t('idea_dropped', 'Idea dropped') : t('idea_restored', 'Idea restored'), 'success'); await load(); }
    catch (e) { show(errorText(e, t), 'warning'); }
    setBusyId('');
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-end gap-[8px]">
        <label className="sr-only" htmlFor={`idea-q-${scope}`}>{t('search_ideas', 'Search ideas')}</label>
        <input id={`idea-q-${scope}`} type="search" placeholder={t('search_ideas', 'Search ideas')} value={q} onChange={(e) => setQ(e.target.value)}
          className="h-[36px] [@media(max-width:480px)]:h-[44px] px-[8px] bg-input border border-fifth rounded-[6px] text-[13px] min-w-[200px]" />
        <select aria-label={t('topic', 'Topic')} value={topic} onChange={(e) => setTopic(e.target.value)} className="h-[36px] [@media(max-width:480px)]:h-[44px] px-[8px] bg-input border border-fifth rounded-[6px] text-[13px]">
          <option value="">{t('all_topics', 'All topics')}</option>
          {data.topics.map((x) => <option key={x} value={x}>{t(`topic_${x.toLowerCase().replace(/[^a-z]+/g, '_')}`, x)}</option>)}
        </select>
        {!brandId && (
          <select aria-label={t('brand', 'Brand')} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-[36px] [@media(max-width:480px)]:h-[44px] px-[8px] bg-input border border-fifth rounded-[6px] text-[13px]">
            <option value="">{t('all_brands', 'All brands')}</option>
            {data.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">{t('no_brand', 'No brand')}</option>
          </select>
        )}
        {canAdd && <button className="ms-auto text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] bg-[#612BD3] text-white" onClick={() => form(null)}>{t('new_idea', 'New idea')}</button>}
      </div>
      <div role="group" aria-label={t('filter_ideas_by_status', 'Filter ideas by status')} className="flex flex-wrap gap-[8px]">
        {STATUSES.map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}
            className={`${QUIET} ${status === s ? 'border-[#612BD3] text-[#5221b8] dark:text-[#c4b5fd] bg-[#612BD3]/10' : ''}`}>
            {t(`idea_status_${s.toLowerCase()}`, LABEL[s])} {count(s)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <div className="text-[13px] text-customColor18">{t('no_ideas_here', 'No ideas here.')}</div> : (
        <ul className="bg-sixth border border-fifth rounded-[12px] divide-y divide-fifth">
          {shown.map((i) => {
            const isOpen = open === i.id;
            const write = writes(i.brandIds);
            const planned = i.plannedFor;
            const plannedBrand = planned ? data.brands.find((b) => b.id === planned.brandId)?.name || '' : '';
            return (
              <li key={i.id} dir={dirOf(i.hook)} className="p-[12px] flex [@media(max-width:480px)]:flex-col gap-[12px]">
                <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                  <button className="text-start text-[15px] font-[600]" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : i.id)}>{i.hook}</button>
                  {i.angle && <p className={`text-[13px] text-customColor18 ${isOpen ? '' : 'line-clamp-1'}`}>{i.angle}</p>}
                  <div className="flex flex-wrap items-center gap-[6px] text-[12px]">
                    {i.brandIds.length === 0
                      ? <span className="px-[6px] rounded-[6px] border border-[#e67700]/40 text-[#8f4700] dark:text-[#ffc078]">{t('no_brand', 'No brand')}</span>
                      : i.brandIds.map((id) => {
                        const b = data.brands.find((x) => x.id === id);
                        const n = data.brands.findIndex((x) => x.id === id);
                        return b ? <span key={id} role="img" title={b.name} aria-label={b.name} className="w-[24px] h-[24px] rounded-full text-white text-[10px] font-[700] flex items-center justify-center" style={{ background: COLORS[n % COLORS.length] }}>{initials(b.name)}</span> : null;
                      })}
                    <span className="px-[6px] rounded-[6px] border border-fifth">{t(`topic_${i.topic.toLowerCase().replace(/[^a-z]+/g, '_')}`, i.topic)}</span>
                    {i.pillars.map((p) => <span key={p} className="px-[6px] rounded-[6px] border border-[#612BD3]/30 text-[#5221b8] dark:text-[#c4b5fd]">{p}</span>)}
                    {i.format && <span className="px-[6px] rounded-[6px] border border-fifth">{t(`format_${i.format.toLowerCase()}`, i.format)}</span>}
                    {status === 'ALL' && <span className="px-[6px] rounded-[6px] border border-fifth">{t(`idea_status_${i.status.toLowerCase()}`, LABEL[i.status])}</span>}
                  </div>
                  {isOpen && (
                    <div className="flex flex-col gap-[6px] text-[13px] pt-[4px]">
                      {i.bullets.length > 0 && <ol className="list-decimal ps-[20px]">{i.bullets.map((b, n) => <li key={n} dir={dirOf(b)}>{b}</li>)}</ol>}
                      {i.note && <p dir={dirOf(i.note)}>{i.note}</p>}
                      <div className="text-[12px] text-customColor18">
                        {/^https?:\/\//.test(i.source) ? <a className="underline" href={i.source} target="_blank" rel="noopener noreferrer">{t('source', 'Source')}</a> : i.source ? `${t('source', 'Source')}: ${i.source}` : null}
                        {' '}{t('added_on', 'Added {date}').replace('{date}', new Date(i.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}
                      </div>
                      {write && i.status === 'NEW' && <button className={`${QUIET} self-start disabled:opacity-50`} disabled={busyId === i.id} aria-label={t('drop_idea_named', 'Drop idea: {hook}').replace('{hook}', i.hook)} onClick={() => setIdeaStatus(i, 'DROPPED')}>{t('drop', 'Drop')}</button>}
                      {write && i.status === 'DROPPED' && <button className={`${QUIET} self-start disabled:opacity-50`} disabled={busyId === i.id} aria-label={t('restore_idea_named', 'Restore idea: {hook}').replace('{hook}', i.hook)} onClick={() => setIdeaStatus(i, 'NEW')}>{t('restore', 'Restore')}</button>}
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-[8px] shrink-0">
                  {planned ? (
                    <button className={`${QUIET.replace(' h-[32px] [@media(max-width:480px)]:h-[44px]', '')} min-h-[32px] [@media(max-width:480px)]:min-h-[44px] py-[4px] text-start`} onClick={() => router.push(`/brands?brand=${planned.brandId}&tab=posts&focus=${encodeURIComponent(`b:${i.briefId}`)}`)}>
                      {(() => {
                        const day = new Date(planned.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        const posted = i.status === 'POSTED';
                        if (!plannedBrand) return posted ? t('posted_on_day', 'Posted · {day}').replace('{day}', day) : t('planned_on_day', 'Planned · {day}').replace('{day}', day);
                        return (posted ? t('posted_on_brand', 'Posted · {day} · {brand}') : t('planned_on_brand', 'Planned · {day} · {brand}'))
                          .replace('{day}', day).replace('{brand}', plannedBrand);
                      })()}
                    </button>
                  ) : write ? (
                    <>
                      <button className={QUIET} aria-label={t('edit_idea_named', 'Edit idea: {hook}').replace('{hook}', i.hook)} onClick={() => form(i)}>{t('edit', 'Edit')}</button>
                      {i.status === 'NEW' && <button className="text-[13px] px-[12px] h-[32px] [@media(max-width:480px)]:h-[44px] rounded-[6px] bg-[#612BD3] text-white" aria-label={t('plan_idea_named', 'Plan idea: {hook}').replace('{hook}', i.hook)} onClick={() => plan(i)}>{t('plan_it', 'Plan it')}</button>}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data.more && <div className="text-[12px] text-customColor18">{t('ideas_more', 'Showing the newest 1000 ideas.')}</div>}
    </div>
  );
};
// <<< SANAD-BRANDS
