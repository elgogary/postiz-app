'use client';
// >>> SANAD-BRANDS: Overview "Where it stands": the plan period as one progress bar, then six counts; each count opens
// the Posts list filtered to it. The count that waits on the signed-in person is highlighted.
import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';
import { Card, STATE_LABEL, whereItStands } from '@gitroom/helpers/brands/post.rules';
import { fmtDay } from './brands.api';

const SEGMENTS: [keyof ReturnType<typeof whereItStands> & string, string][] = [
  ['published', '#2b8a3e'], ['scheduled', '#8ce99a'], ['review', '#612BD3'], ['changes', '#e67700'], ['draft', '#adb5bd'], ['planned', '#dee2e6'],
];
const shortDate = (day: string, year = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' });

export const BrandStands: FC<{ cards: Card[]; role: BrandRole; window: { from: string; to: string }; go: (tab: string, filter?: string) => void }> = ({ cards, role, window, go }) => {
  const t = useT();
  const s = whereItStands(cards, new Date());
  const n = (k: string) => (s as unknown as Record<string, number>)[k];
  const join = (parts: (string | false)[]) => parts.filter(Boolean).join(' · ');
  const passed = t('date_passed_lc', 'date passed');
  const notes: Record<string, string> = {
    published: '',
    scheduled: s.nextScheduled ? `${t('next', 'next')} ${fmtDay(s.nextScheduled)}` : '',
    review: join([s.reviewDatePassed > 0 && `${s.reviewDatePassed} ${passed}`, s.reviewDueSoon > 0 && `${s.reviewDueSoon} ${t('due_soon', 'due soon')}`]),
    changes: join([s.changes > 0 && s.waitingOn.length > 0 && `${t('waiting_on', 'waiting on')} ${s.waitingOn.join(', ')}`, s.changesDatePassed > 0 && `${s.changesDatePassed} ${passed}`]),
    draft: join([s.draftsMissingMedia > 0 && `${s.draftsMissingMedia} ${t('missing_media', 'missing media')}`, s.draftsDatePassed > 0 && `${s.draftsDatePassed} ${passed}`]),
    planned: join([s.planned > 0 && t('no_draft_yet', 'no draft yet'), s.plannedDatePassed > 0 && `${s.plannedDatePassed} ${passed}`]),
  };
  const hot = role === 'approve' ? 'review' : role === 'create' ? 'changes' : '';
  const label = (k: string) => (k === 'draft' ? t('drafts', 'Drafts') : t(`state_${k}`, STATE_LABEL[k as keyof typeof STATE_LABEL]));
  return (
    <section className="bg-sixth border border-fifth rounded-[12px] p-[16px] flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <h3 className="text-[15px] font-[600]">{t('where_it_stands', 'Where it stands')}</h3>
        <span className="ms-auto text-[13px] text-customColor18">
          {s.nextScheduled ? `${t('next_post', 'Next post')} ${fmtDay(s.nextScheduled)}` : t('nothing_scheduled', 'Nothing scheduled')}
        </span>
      </div>
      {s.total === 0 ? <div className="text-[13px] text-customColor18">{t('no_posts_yet', 'No posts yet.')}</div> : (
        <>
          <div className="flex items-baseline gap-[8px] flex-wrap">
            <span className="text-[24px] font-[700]">{s.published} {t('of', 'of')} {s.total}</span>
            <span className="text-[13px] text-customColor18">{t('published_plan_period', 'published · plan {from} to {to}').replace('{from}', shortDate(window.from)).replace('{to}', shortDate(window.to, true))}</span>
          </div>
          <div className="flex h-[16px] rounded-[6px] overflow-hidden border border-fifth" role="img"
            aria-label={SEGMENTS.map(([k]) => `${label(k)} ${n(k)}`).join(', ')}>
            {SEGMENTS.filter(([k]) => n(k) > 0).map(([k, color]) => <span key={k} style={{ flexGrow: n(k), background: color }} />)}
          </div>
          <div className="grid grid-cols-6 mobile:grid-cols-3 [@media(max-width:480px)]:grid-cols-2 gap-[8px]">
            {SEGMENTS.map(([k]) => (
              <button key={k} onClick={() => go('posts', k)}
                className={`text-start rounded-[8px] border p-[8px] min-h-[44px] ${hot === k && n(k) > 0 ? 'border-[#612BD3] bg-[#612BD3]/5' : 'border-fifth'}`}>
                <div className="text-[20px] font-[700]">{n(k)}</div>
                <div className="text-[12px]">{label(k)}</div>
                {hot === k && n(k) > 0 && <div className="text-[11px] font-[600] text-[#5221b8] dark:text-[#c4b5fd]">{t('waiting_for_you_short', 'Waiting for you')}</div>}
                {notes[k] && <div className={`text-[12px] ${notes[k].includes(passed) ? 'text-[#c92a2a] dark:text-[#ff8787]' : k === 'changes' || k === 'draft' ? 'text-[#b35c00] dark:text-[#ffa94d]' : 'text-customColor18'}`}>{notes[k]}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
// <<< SANAD-BRANDS
