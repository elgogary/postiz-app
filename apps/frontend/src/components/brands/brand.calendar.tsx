'use client';
// >>> SANAD-BRANDS: Calendar tab: the plan period as a month grid (Sunday first); each post is a chip tinted by its goal.
// Clicking a post opens it on the Posts tab with its brief open. Below 768 px the grid is a list of days with posts.
import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Card, STATE_LABEL, calendarWeeks, datePassed, localDay, mediaMissing } from '@gitroom/helpers/brands/post.rules';
import { dirOf, type BrandPosts } from './brands.api';

const TINTS = ['#3b5bdb', '#0b7285', '#2b8a3e', '#c2255c', '#e67700', '#5f3dc4'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const BrandCalendar: FC<{ data: BrandPosts; onOpen: (c: Card) => void }> = ({ data, onOpen }) => {
  const t = useT();
  const tz = new Date().getTimezoneOffset();
  const now = new Date();
  const today = localDay(now.toISOString(), tz);
  const goals = [...new Set(data.cards.map((c) => c.goal).filter(Boolean))].sort();
  const tint = (goal: string) => TINTS[Math.max(0, goals.indexOf(goal)) % TINTS.length];
  const byDay = new Map<string, Card[]>();
  for (const c of data.cards) {
    const d = localDay(c.date, tz);
    byDay.set(d, [...(byDay.get(d) || []), c]);
  }
  const inPlan = (d: string) => d >= data.window.from && d <= data.window.to;
  // The grid also covers any post dated outside the plan period, so the calendar never hides a counted post.
  const days = [...byDay.keys()].sort();
  const from = days.length && days[0] < data.window.from ? days[0] : data.window.from;
  const to = days.length && days[days.length - 1] > data.window.to ? days[days.length - 1] : data.window.to;
  return (
    <div className="flex flex-col gap-[12px]">
      {goals.length > 0 && (
        <div className="flex flex-wrap gap-[8px] text-[12px]">
          {goals.map((g) => <span key={g} className="px-[8px] py-[2px] rounded-[6px] border" style={{ borderColor: `${tint(g)}55`, background: `${tint(g)}14` }}>{g}</span>)}
        </div>
      )}
      <div className="grid grid-cols-7 [@media(max-width:768px)]:grid-cols-1 gap-[4px]">
        {DAYS.map((d) => <div key={d} className="text-[12px] text-customColor18 px-[4px] [@media(max-width:768px)]:hidden">{t(`day_${d.toLowerCase()}`, d)}</div>)}
        {calendarWeeks(from, to).flat().map((d) => {
          const posts = byDay.get(d) || [];
          return (
            <div key={d} className={`min-h-[104px] border border-fifth rounded-[6px] p-[4px] flex flex-col gap-[4px] ${inPlan(d) || posts.length ? '' : 'opacity-40'} ${posts.length ? '' : '[@media(max-width:768px)]:hidden'}`}>
              <div className={`text-[12px] ${d === today ? 'text-[#5221b8] dark:text-[#c4b5fd] font-[700]' : 'text-customColor18'}`}>
                {new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
              </div>
              {posts.map((c) => (
                <button key={c.key} onClick={() => onOpen(c)} className="text-start rounded-[6px] border p-[4px] text-[12px] min-h-[44px]"
                  style={{ borderColor: `${tint(c.goal)}55`, background: `${tint(c.goal)}14` }}>
                  <div>{[c.goal, c.format].filter(Boolean).join(' · ')}{mediaMissing(c.format, c.media) && c.state !== 'planned' ? ` · ${t('no_media_yet', 'no media yet')}` : ''}</div>
                  <div dir={dirOf(c.title)} className="font-[600] line-clamp-2">{c.title}</div>
                  <div className="text-customColor18">{t(`state_${c.state}`, STATE_LABEL[c.state])}{datePassed(c, now) ? ` · ${t('date_passed_lc', 'date passed')}` : ''}</div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
