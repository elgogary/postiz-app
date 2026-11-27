'use client';
// >>> SANAD-BRANDS: small pieces the Email tab's three views share: chips, the quiet button, table cells, the skeleton.
import { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { CampaignState, Rate } from '@gitroom/helpers/brands/email.rules';
import { dirOf } from './brands.api';

export const TONE = {
  green: 'bg-[#2b8a3e]/10 text-[#1f6f30] dark:text-[#8ce99a]',
  purple: 'bg-[#612BD3]/10 text-[#5221b8] dark:text-[#c4b5fd]',
  amber: 'bg-[#e67700]/10 text-[#8f4700] dark:text-[#ffc078]',
  grey: 'bg-[#868e96]/15 text-[#495057] dark:text-[#ced4da]',
};
const CHIP = 'inline-flex items-center h-[22px] px-[8px] rounded-[8px] text-[12px] font-[600] whitespace-nowrap';
export const QUIET = 'text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth disabled:opacity-50';
export const CARD = 'bg-sixth border border-fifth rounded-[12px] p-[16px]';
export const TH = 'bg-sixth text-[13px] font-[600] text-start px-[16px] h-[36px] border-b border-fifth whitespace-nowrap';
export const TD = 'px-[16px] py-[8px] h-[60px] border-b border-fifth align-middle';
export const NUM = 'text-end tabular-nums';

const STATE_TONE: Record<CampaignState, string> = {
  sent: TONE.green, sending: TONE.purple, scheduled: TONE.green, paused: TONE.amber, cancelled: TONE.grey, draft: TONE.grey,
};
const STATE_TEXT: Record<CampaignState, string> = {
  sent: 'Sent', sending: 'Sending', scheduled: 'Scheduled', paused: 'Paused', cancelled: 'Cancelled', draft: 'Draft',
};

export const Chip: FC<{ tone: string; children: ReactNode }> = ({ tone, children }) => <span className={`${CHIP} ${tone}`}>{children}</span>;

export const StateChip: FC<{ state: CampaignState }> = ({ state }) => {
  const t = useT();
  return <Chip tone={STATE_TONE[state]}>{t(`email_state_${state}`, STATE_TEXT[state])}</Chip>;
};

// Names and subjects may be Arabic: isolate each so the bidi order of the cell around it stays put.
export const Text: FC<{ text: string }> = ({ text }) => <bdi dir={dirOf(text)}>{text}</bdi>;

export const fmtAt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}) : '');
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export const pctText = (p: number | null) => (p === null ? '' : `${p}%`);

export const RateCell: FC<{ r: Rate | null }> = ({ r }) => (
  <td className={`${TD} ${NUM}`}>
    {r && r.pct !== null && <><span className="block font-[600]">{pctText(r.pct)}</span><span className="block text-[12px] text-customColor18">{r.count}</span></>}
  </td>
);

export const Skeleton: FC = () => (
  <div aria-busy="true" className="flex flex-col gap-[8px]">
    {[0, 1, 2, 3].map((i) => <div key={i} className="h-[60px] rounded-[8px] bg-fifth/60 animate-pulse" />)}
  </div>
);

export const Retry: FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => {
  const t = useT();
  return (
    <div className="flex items-center gap-[16px] text-[14px] text-customColor18 flex-wrap">
      {text}
      <button className={QUIET} onClick={onRetry}>{t('try_again', 'Try again')}</button>
    </div>
  );
};

export type EmailGo = (next: { tab?: string; filter?: string; focus?: string }) => void;

// Campaigns | Lists: one switch, two views of the same tab.
export const EmailSwitch: FC<{ on: 'campaigns' | 'lists'; campaigns: number; lists: number; go: EmailGo }> = ({ on, campaigns, lists, go }) => {
  const t = useT();
  const part = (key: 'campaigns' | 'lists', label: string, n: number) => (
    <button aria-pressed={on === key} onClick={() => go({ tab: 'email', filter: key === 'lists' ? 'lists' : undefined })}
      className={`inline-flex items-center gap-[8px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] text-[14px] ${key === 'lists' ? 'border-s border-fifth' : ''} ${on === key ? 'bg-sixth text-[#5221b8] dark:text-[#c4b5fd] font-[600]' : 'font-[500]'}`}>
      {label} <em className="not-italic text-[12px] text-customColor18">{n}</em>
    </button>
  );
  return (
    <div role="group" aria-label={t('email_views', 'Email views')} className="inline-flex border border-fifth rounded-[8px] overflow-hidden">
      {part('campaigns', t('email_campaigns', 'Campaigns'), campaigns)}
      {part('lists', t('email_lists', 'Lists'), lists)}
    </div>
  );
};
// <<< SANAD-BRANDS
