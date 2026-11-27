'use client';
// >>> SANAD-BRANDS: one campaign: four numbers, links clicked, not delivered, history. One page, no sub-tabs:
// per-person tracking is off, so separate Opens and Clicks tabs would only repeat these numbers.
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import type { EmailReport, HistoryStep, Rate } from '@gitroom/helpers/brands/email.rules';
import { errorText, useBrandsApi } from './brands.api';
import { CARD, EmailGo, fmtAt, pctText, QUIET, Retry, Skeleton, StateChip, Text } from './brand.email.ui';

const STEP: Record<HistoryStep, [string, string]> = {
  sent_for_review: ['email_step_review', 'Sent for review'], approved: ['email_step_approved', 'Approved'],
  sent: ['email_step_sent', 'Sent'], finished: ['email_step_finished', 'Finished'],
};

const Stat: FC<{ label: string; r: Rate | null; note: ReactNode }> = ({ label, r, note }) => (
  <div className={CARD}>
    <div className="text-[13px] text-customColor18">{label}</div>
    <div className="text-[24px] font-[600] leading-[1.3] mt-[4px] tabular-nums">{r && r.pct !== null ? pctText(r.pct) : '0%'}</div>
    <div className="text-[13px] text-customColor18">{note}</div>
  </div>
);

const Rows: FC<{ title: string; className?: string; rows: [ReactNode, number | string, string][] }> = ({ title, className = '', rows }) => (
  <div className={`${CARD} ${className}`}>
    <h3 className="text-[14px] font-[600] mb-[8px]">{title}</h3>
    {rows.map(([k, v, key]) => (
      <div key={key} className="flex justify-between gap-[16px] py-[8px] border-t border-fifth first:border-t-0 first:pt-0">
        <span className="min-w-0 break-words">{k}</span><b className="font-[600] tabular-nums">{v}</b>
      </div>
    ))}
  </div>
);

export const BrandEmailReport: FC<{ brandId: string; channelId: string; campaignId: number; go: EmailGo }> = ({ brandId, channelId, campaignId, go }) => {
  const t = useT();
  const api = useBrandsApi();
  const modals = useModals();
  const { show } = useToaster();
  const [rep, setRep] = useState<EmailReport | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const tt = useRef(t);
  tt.current = t;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    try {
      const r = await api.emailReport(brandId, channelId, campaignId);
      if (mine === seq.current) setRep(r);
    } catch (e) {
      if (mine === seq.current) setError(errorText(e, tt.current));
    }
  }, [api, brandId, channelId, campaignId]);
  useEffect(() => { setRep(null); load(); return () => { seq.current += 1; }; }, [load]);

  const back = () => go({ tab: 'email' });
  const crumb = (name: string) => (
    <div className="text-[13px] text-customColor18">
      <button className="font-[600] text-[#5221b8] dark:text-[#c4b5fd] [@media(max-width:480px)]:min-h-[44px]" onClick={back}>{t('email_campaigns', 'Campaigns')}</button> / {name && <Text text={name} />}
    </div>
  );
  if (error && !rep) return <div className="flex flex-col gap-[8px]">{crumb('')}<Retry text={error} onRetry={load} /></div>;
  if (!rep) return <Skeleton />;

  const { row } = rep;
  const preview = async () => {
    try {
      const { html } = await api.emailPreview(brandId, channelId, campaignId);
      modals.openModal({
        title: row.subject || row.name, closeOnClickOutside: true, closeOnEscape: true,
        children: () => <iframe sandbox="" srcDoc={html} title={t('email_preview', 'Email preview')} className="w-[min(640px,calc(100vw_-_64px))] h-[70vh] border border-fifth rounded-[8px] bg-white" />,
      });
    } catch (e) { show(errorText(e, t), 'warning'); }
  };
  const d = rep.delivered;
  const failures: [string, number, string][] = rep.notDelivered ? [
    [t('email_not_delivered_hard', 'Address does not exist'), rep.notDelivered.hard, 'hard'],
    [t('email_not_delivered_soft', 'Temporary failure'), rep.notDelivered.soft, 'soft'],
    [t('email_not_delivered_blocked', 'Blocked'), rep.notDelivered.blocked, 'blocked'],
  ] : [];
  const shown = failures.filter(([, n]) => n > 0);
  const opens = row.opened?.count ?? 0;
  const uncertain = rep.uncertainOpens || 0;

  return (
    <div className="flex flex-col gap-[8px]">
      {crumb(row.name)}
      <div className="flex items-center gap-[8px] flex-wrap">
        <h2 className="text-[20px] font-[600]"><Text text={row.name} /></h2>
        <StateChip state={row.state} />
        <button className={`${QUIET} ms-auto`} onClick={preview}>{t('email_view', 'View email')}</button>
      </div>
      <div className="text-[13px] text-customColor18">
        {t('email_sent_on', 'Sent')} <b className="font-[500] text-textColor">{fmtAt(row.at)}</b>
        {rep.lists.length > 0 && <> · {t('email_list', 'List')} {rep.lists.map((l, i) => <b key={l.id} className="font-[500] text-textColor">{i > 0 && ', '}<Text text={l.name} /></b>)}</>}
        {rep.from && <> · {t('email_from', 'From')} <b className="font-[500] text-textColor" dir="ltr">{rep.from}</b></>}
      </div>
      {row.subject && <div className="text-[13px] text-customColor18">{t('email_subject', 'Subject')} <b className="font-[500] text-textColor"><Text text={row.subject} /></b></div>}
      <div className="grid grid-cols-4 [@media(max-width:900px)]:grid-cols-2 [@media(max-width:480px)]:grid-cols-1 gap-[24px] mt-[16px]">
        {d && <Stat label={t('email_delivered', 'Delivered')} r={d} note={`${d.count} ${t('email_of', 'of')} ${row.sentTo} ${t('email_sent_lc', 'sent')}`} />}
        <Stat label={t('email_opened', 'Opened')} r={row.opened} note={d
          ? `${opens} ${t('email_people', 'people')}${uncertain > 0 ? ` · ${uncertain} ${t('email_not_certain', 'not certain (Apple Mail)')}` : ''}`
          : `${opens} ${t('email_opens', 'opens')}`} />
        <Stat label={t('email_clicked', 'Clicked')} r={row.clicked} note={`${row.clicked?.count ?? 0} ${d ? t('email_people', 'people') : t('email_clicks', 'clicks')}`} />
        <Stat label={t('email_unsubscribed', 'Unsubscribed')} r={row.unsubscribed} note={`${row.unsubscribed?.count ?? 0} ${t('email_people', 'people')}`} />
      </div>
      {(rep.links.length > 0 || shown.length > 0) && (
        <div className="grid grid-cols-4 [@media(max-width:900px)]:grid-cols-2 [@media(max-width:480px)]:grid-cols-1 gap-[24px] mt-[16px]">
          {rep.links.length > 0 && (
            <Rows title={t('email_links_clicked', 'Links clicked')} className="col-span-2 [@media(max-width:480px)]:col-span-1"
              rows={rep.links.map((l): [ReactNode, number, string] => [<bdi key={l.url} dir="ltr" className="break-all">{l.url}</bdi>, l.clicks, l.url])} />
          )}
          {shown.length > 0 && <Rows title={t('email_not_delivered', 'Not delivered')} rows={shown} />}
        </div>
      )}
      {rep.history.length > 0 && (
        <div className={`${CARD} mt-[16px]`}>
          <h3 className="text-[14px] font-[600] mb-[8px]">{t('email_history', 'History')}</h3>
          {rep.history.map((h, i) => (
            <div key={`${h.step}:${i}`} className="flex justify-between gap-[16px] py-[8px] border-t border-fifth first:border-t-0 first:pt-0">
              <span>{t(STEP[h.step][0], STEP[h.step][1])}{h.by && <> {t('email_by', 'by')} <Text text={h.by} /></>}</span>
              <span className="text-customColor18 text-[13px] whitespace-nowrap">{fmtAt(h.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
// <<< SANAD-BRANDS
