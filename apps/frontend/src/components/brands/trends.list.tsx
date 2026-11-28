'use client';
// >>> SANAD-BRANDS: the weekly trends list shared by a brand's Trends tab (scope = the brand) and the Trends page
// (scope = all, with a brand picker and a Brand column). Prototype: docs/prototypes/postiz/trends-tab.
import { FC, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { roundParts, trendParts, type TrendItem, type TrendView } from '@gitroom/helpers/brands/trend.rules';
import { BrandSummary, TrendsData, dirOf, errorText, useBrandsApi } from './brands.api';
import { Retry, Skeleton, TD as TDBASE, TH, Text } from './brand.email.ui';
import { IdeaPlan } from './idea.plan';

const COLORS = ['#3b5bdb', '#0b7285', '#2b8a3e', '#c2255c', '#b35c00', '#5f3dc4'];
const initials = (name: string) => name.split(/\s+/).filter((w) => /\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const QUIET = 'text-[13px] px-[12px] h-[32px] [@media(max-width:480px)]:h-[44px] rounded-[6px] border border-fifth disabled:opacity-50 whitespace-nowrap';
const ON = 'border-[#612BD3] text-[#5221b8] dark:text-[#c4b5fd] bg-[#612BD3]/10';
const SELECT = 'h-[36px] [@media(max-width:480px)]:h-[44px] px-[8px] bg-input border border-fifth rounded-[6px] text-[13px]';
const SOURCES: [TrendItem['kind'], string, string][] = [
  ['news', 'source_news', 'News'], ['github', 'source_github', 'GitHub'], ['hn', 'source_hn', 'Hacker News'],
  ['linkedin', 'source_linkedin', 'LinkedIn'], ['tiktok', 'source_tiktok', 'TikTok'],
];
const DAY = 86400000;
const TD = TDBASE.replace('h-[60px]', '').replace(/\s+/g, ' ').trim();

const has = (v: TrendView, kind: TrendItem['kind']) => {
  const n = v.items.some((i) => i.kind === kind);
  if (kind === 'news') return n || v.thisWeek > 0 || v.signals.outlets > 0;
  if (kind === 'github') return n || v.signals.topRepoStars > 0;
  if (kind === 'hn') return n || v.signals.hnPoints > 0;
  if (kind === 'linkedin') return n || v.signals.linkedinReactions > 0;
  return n;
};
const num = (n: number) => n.toLocaleString('en-US');
const trim = (n: number) => String(Math.round(n * 10) / 10);
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// The week starts on a Sunday (UTC) and ends six days later.
const weekEnds = (iso: string): [string, string] => {
  const a = new Date(iso);
  const b = new Date(a.getTime() + 6 * DAY);
  const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
  return [f(a, a.getUTCMonth() === b.getUTCMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' }), f(b, { day: 'numeric', month: 'short', year: 'numeric' })];
};

export const TrendsList: FC<{ scope: string }> = ({ scope }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const modals = useModals();
  const [data, setData] = useState<TrendsData | null>(null);
  const [all, setAll] = useState<BrandSummary[]>([]);
  const [failed, setFailed] = useState('');
  const [source, setSource] = useState('');
  const [brand, setBrand] = useState('');
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const seq = useRef(0);
  const tt = useRef(t);
  tt.current = t;
  const page = scope === 'all';

  const load = useCallback(() => {
    const mine = ++seq.current;
    setFailed('');
    return api.trends(scope).then((d) => { if (mine === seq.current) setData(d); })
      .catch((e) => { if (mine === seq.current) setFailed(errorText(e, tt.current)); });
  }, [api, scope]);
  useEffect(() => { setData(null); setSource(''); setBrand(''); setOpen(''); setFresh({}); load(); return () => { seq.current += 1; }; }, [load]);
  useEffect(() => { if (page) api.list().then(setAll).catch(() => setAll([])); }, [api, page]);

  const trends = data?.trends || [];
  const byBrand = useMemo(() => trends.filter((v) => !brand || v.brandId === brand), [trends, brand]);
  const shown = source ? byBrand.filter((v) => has(v, source as TrendItem['kind'])) : byBrand;
  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    trends.forEach((v) => seen.set(v.brandId, v.brandName));
    return [...seen.entries()];
  }, [trends]);

  if (failed && !data) return <Retry text={failed} onRetry={load} />;
  if (!data) return <Skeleton />;
  if (!data.week || trends.length === 0) return <div className="text-[13px] text-customColor18">{t('trends_empty', 'Trends appear after the first Sunday run.')}</div>;

  const colorOf = (id: string) => COLORS[Math.max(0, all.findIndex((b) => b.id === id)) % COLORS.length];
  const save = async (v: TrendView) => {
    setBusy(v.id);
    try {
      const r = await api.saveTrend(v.id);
      setData((d) => d && { ...d, trends: d.trends.map((x) => (x.id === v.id ? { ...x, ideaId: r.ideaId } : x)) });
      setFresh((f) => ({ ...f, [v.id]: r.ideaId }));
      show(t('trend_saved', 'Saved to Ideas'), 'success');
    } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy('');
  };
  const planIt = async (v: TrendView) => {
    setBusy(v.id);
    try {
      const ideas = await api.ideas(v.brandId);
      const idea = ideas.ideas.find((i) => i.id === fresh[v.id]);
      if (!idea) throw new Error('missing');
      modals.openModal({
        title: t('plan_this_idea', 'Plan this idea'), closeOnClickOutside: false, closeOnEscape: true,
        children: (close: () => void) => <IdeaPlan data={ideas} idea={idea} brandId={v.brandId} close={close}
          onDone={() => setFresh((f) => { const { [v.id]: _gone, ...rest } = f; return rest; })} />,
      });
    } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy('');
  };
  const [from, to] = weekEnds(data.week);
  const cols = page ? 7 : 6;

  const where = (v: TrendView) => {
    const out: string[] = [];
    const list = (k: TrendItem['kind']) => v.items.filter((i) => i.kind === k);
    if (has(v, 'news') && (v.thisWeek > 0 || v.signals.outlets > 0)) {
      out.push([v.thisWeek > 0 ? `${t('source_news', 'News')} ${v.thisWeek}${v.capped ? '+' : ''}` : t('source_news', 'News'),
        v.signals.outlets > 0 ? `${v.signals.outlets} ${t('outlets', 'outlets')}` : ''].filter(Boolean).join(' · '));
    }
    if (has(v, 'github')) {
      const n = list('github').length;
      out.push([`${t('source_github', 'GitHub')}${n > 0 ? ` ${n} ${t('repos', 'repos')}` : ''}`, `${num(v.signals.topRepoStars)} ${t('stars', 'stars')}`].join(n > 0 ? ' · ' : ' '));
    }
    if (has(v, 'hn')) out.push(`${t('source_hn', 'Hacker News')} ${num(v.signals.hnPoints)} ${t('points', 'points')}`);
    if (has(v, 'linkedin')) {
      const n = list('linkedin').length;
      out.push([`${t('source_linkedin', 'LinkedIn')}${n > 0 ? ` ${n} ${t('posts', 'posts')}` : ''}`, `${num(v.signals.linkedinReactions)} ${t('reactions', 'reactions')}`].join(n > 0 ? ' · ' : ' '));
    }
    list('tiktok').slice(0, 2).forEach((i) => out.push(`${t('source_tiktok', 'TikTok')} ${i.title}`));
    return out;
  };
  const growth = (v: TrendView) => (v.growth === null ? t('trend_new', 'New') : `+${Math.round(v.growth * 100)}%${v.capped ? ` ${t('or_more', 'or more')}` : ''}`);
  const parts = (v: TrendView) => {
    const p = roundParts(trendParts({ ...v.signals, growth: v.growth }));
    return t('trend_score_line', 'Growth {g} + engagement {e} + spread {s} + freshness {f} = {n}')
      .replace('{g}', String(p.growth)).replace('{e}', String(p.engagement))
      .replace('{s}', String(p.spread)).replace('{f}', String(p.freshness)).replace('{n}', String(v.score));
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        {page && (
          <select aria-label={t('brand', 'Brand')} value={brand} onChange={(e) => setBrand(e.target.value)} className={SELECT}>
            <option value="">{t('all_brands', 'All brands')}</option>
            {brands.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        <div role="group" aria-label={t('filter_trends_by_source', 'Filter trends by source')} className="flex flex-wrap gap-[8px]">
          <button aria-pressed={!source} onClick={() => setSource('')} className={`${QUIET} ${!source ? ON : ''}`}>{t('all', 'All')} {byBrand.length}</button>
          {SOURCES.filter(([k]) => byBrand.some((v) => has(v, k))).map(([k, key, label]) => (
            <button key={k} aria-pressed={source === k} onClick={() => setSource(k)} className={`${QUIET} ${source === k ? ON : ''}`}>
              {t(key, label)} {byBrand.filter((v) => has(v, k)).length}
            </button>
          ))}
        </div>
        <span className="ms-auto text-[13px] text-customColor18">{t('trends_week', 'Week of {from} to {to}').replace('{from}', from).replace('{to}', to)}</span>
      </div>
      {failed && <Retry text={failed} onRetry={load} />}
      <div className="bg-sixth border border-fifth rounded-[12px] overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col style={{ width: page ? 280 : 300 }} />{page && <col style={{ width: 168 }} />}<col style={{ width: 76 }} /><col style={{ width: 200 }} /><col /><col style={{ width: 176 }} /><col style={{ width: 144 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH}>{t('trend', 'Trend')}</th>{page && <th className={TH}>{t('brand', 'Brand')}</th>}
              <th className={TH}>{t('score', 'Score')}</th><th className={TH}>{t('growth', 'Growth')}</th>
              <th className={TH}>{t('where_it_shows', 'Where it shows')}</th><th className={TH}>{t('pillar', 'Pillar')}</th><th className={TH}><span className="sr-only">{t('actions', 'Actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={cols} className={`${TD} text-customColor18`}>{t('no_trends_here', 'No trends here.')}</td></tr>}
            {shown.map((v) => {
              const isOpen = open === v.id;
              return (
                <Fragment key={v.id}>
                  <tr className="cursor-pointer align-top" onClick={() => setOpen(isOpen ? '' : v.id)}>
                    <td className={`${TD} align-top`}>
                      <button className="block text-start font-[600] text-[14px]" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpen(isOpen ? '' : v.id); }}><Text text={v.title} /></button>
                      <span className="block text-[12px] text-customColor18">{v.kind.toLowerCase() === 'story' ? t('kind_story', 'Story') : t('kind_topic', 'Topic')}</span>
                    </td>
                    {page && (
                      <td className={`${TD} align-top`}>
                        <span className="inline-flex items-center gap-[6px]">
                          <span role="img" aria-label={v.brandName} className="w-[24px] h-[24px] rounded-full text-white text-[10px] font-[700] flex items-center justify-center" style={{ background: colorOf(v.brandId) }}>{initials(v.brandName)}</span>
                          <Text text={v.brandName} />
                        </span>
                      </td>
                    )}
                    <td className={`${TD} align-top text-[20px] font-[600] tabular-nums`}>{v.score}</td>
                    <td className={`${TD} align-top`}>
                      <span className="block font-[600]">{growth(v)}</span>
                      <span className="block text-[12px] text-customColor18">{t('trend_basis', '{n} articles; 4-week average {a}').replace('{n}', `${v.thisWeek}${v.capped ? '+' : ''}`).replace('{a}', trim(v.average))}</span>
                    </td>
                    <td className={`${TD} align-top`}>
                      <div className="flex flex-wrap gap-[6px]">{where(v).map((w) => <span key={w} className="px-[6px] rounded-[6px] border border-fifth text-[12px]"><Text text={w} /></span>)}</div>
                    </td>
                    <td className={`${TD} align-top`}>{v.pillar && <span className="px-[6px] rounded-[6px] border border-[#612BD3]/30 text-[12px] text-[#5221b8] dark:text-[#c4b5fd]"><Text text={v.pillar} /></span>}</td>
                    <td className={`${TD} align-top text-end`} onClick={(e) => e.stopPropagation()}>
                      {fresh[v.id] ? (
                        <span className="inline-flex items-center gap-[8px]">
                          <span className="text-[12px] text-customColor18">{t('saved', 'Saved')}</span>
                          <button className={QUIET} disabled={busy === v.id} onClick={() => planIt(v)}>{t('plan_it', 'Plan it')}</button>
                        </span>
                      ) : v.ideaId ? (
                        <Link className="underline" href={`/brands?brand=${v.brandId}&tab=ideas`}>{t('saved_to_ideas', 'Saved to Ideas')}</Link>
                      ) : v.canSave ? (
                        <button className={QUIET} disabled={busy === v.id} onClick={() => save(v)}>{t('save_as_idea', 'Save as idea')}</button>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={cols} className="px-[16px] py-[12px] border-b border-fifth bg-newBgColorInner">
                        <div className="grid grid-cols-2 [@media(max-width:768px)]:grid-cols-1 gap-[16px] text-[13px]">
                          <div>
                            <h4 className="font-[600] mb-[4px]">{t('top_this_week', 'Top this week')}</h4>
                            <ol className="list-decimal ps-[20px] flex flex-col gap-[4px]">
                              {v.items.slice(0, 3).map((i, n) => (
                                <li key={n}>
                                  {/^https?:\/\//.test(i.url) ? <a className="underline" href={i.url} target="_blank" rel="noopener noreferrer"><Text text={i.title} /></a> : <Text text={i.title} />}
                                  <span className="text-[12px] text-customColor18"> {[i.source, day(i.date)].filter(Boolean).join(' · ')}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <h4 className="font-[600] mb-[4px]">{t('why_it_fits', 'Why it fits')}</h4>
                            <p dir={dirOf(v.fit)} className="mb-[12px]">{v.fit}</p>
                            <h4 className="font-[600] mb-[4px]">{t('how_score_adds_up', 'How the score adds up')}</h4>
                            <p>{parts(v)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
