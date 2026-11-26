'use client';
// >>> SANAD-BRANDS: Overview Connections as one white card per group, 3 columns (owner pick B, 26 Nov).
import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { BrandDetail, BrandPosts } from './brands.api';

interface Tile { label: string; count?: number | string; tab?: string; filter?: string }

const Group: FC<{ title: string; tiles: Tile[]; go: (tab: string, filter?: string) => void }> = ({ title, tiles, go }) => (
  <div className="bg-sixth border border-fifth rounded-[8px] overflow-hidden">
    <h4 className="text-[13px] font-[600] text-customColor18 px-[16px] py-[8px] border-b border-fifth">{title}</h4>
    {tiles.map((tile) => {
      const inside = (
        <>
          {tile.label}
          {tile.count !== undefined && tile.count !== '' && <span className="text-[12px] px-[8px] rounded-[6px] bg-newColColor">{tile.count}</span>}
        </>
      );
      const row = 'w-full flex items-center gap-[8px] px-[16px] min-h-[32px] [@media(max-width:480px)]:min-h-[44px] text-[13px] text-start';
      // A tile without a tab is a plain row: nothing to open, so it does not look like a button.
      return tile.tab
        ? <button key={tile.label} onClick={() => go(tile.tab!, tile.filter)} className={`${row} hover:bg-newColColor [&+*]:border-t [&+*]:border-fifth`}>{inside}</button>
        : <div key={tile.label} className={`${row} [&+*]:border-t [&+*]:border-fifth`}>{inside}</div>;
    })}
  </div>
);

export const BrandConnections: FC<{ brand: BrandDetail; posts: BrandPosts | null; go: (tab: string, filter?: string) => void }> = ({ brand, posts, go }) => {
  const t = useT();
  const n = (k: string) => brand.sections[k]?.rows?.length || '';
  const count = (s: string) => posts ? posts.cards.filter((c) => c.state === s).length || '' : '';
  return (
    <section className="flex flex-col gap-[16px]">
      <h3 className="text-[15px] text-customColor18">{t('connections', 'Connections')}</h3>
      <div className="grid gap-[24px] items-start grid-cols-3 mobile:grid-cols-1">
        <div className="grid gap-[24px]">
          <Group title={t('content', 'Content')} go={go} tiles={[
            { label: t('posts', 'Posts'), count: posts?.cards.length ?? '', tab: 'posts', filter: 'all' },
            { label: t('ideas', 'Ideas'), tab: 'ideas' },
            { label: t('planned_no_draft', 'Planned, no draft yet'), count: count('planned'), tab: 'posts', filter: 'planned' },
          ]} />
          <Group title={t('this_months_plan', "This month's plan")} go={go} tiles={[
            { label: t('focus', 'Focus'), count: brand.sections.focus?.rows?.length ? `${brand.sections.focus.rows.length} ${t('weeks', 'weeks')}` : '', tab: 'focus' },
            { label: t('calendar', 'Calendar'), count: posts?.cards.length ?? '', tab: 'calendar' },
            { label: t('content_mix', 'Content mix'), tab: 'mix' },
            { label: t('kpis', 'KPIs'), count: n('kpi'), tab: 'kpi' },
          ]} />
        </div>
        <div className="grid gap-[24px]">
          <Group title={t('review', 'Review')} go={go} tiles={[
            { label: brand.role === 'approve' ? t('waiting_for_your_review', 'Waiting for your review') : t('waiting_for_review', 'Waiting for review'), count: count('review'), tab: 'posts', filter: 'review' },
            { label: t('state_changes', 'Sent back'), count: count('changes'), tab: 'posts', filter: 'changes' },
            { label: t('state_scheduled', 'Scheduled'), count: count('scheduled'), tab: 'posts', filter: 'scheduled' },
          ]} />
          <Group title={t('brand_book', 'Brand book')} go={go} tiles={[
            { label: t('summary', 'Summary'), tab: 'summary' }, { label: t('voice', 'Voice'), tab: 'voice' },
            { label: t('benchmark', 'Benchmark'), count: n('bench'), tab: 'bench' }, { label: t('engagement', 'Engagement'), tab: 'routine' },
          ]} />
        </div>
        <div className="grid gap-[24px]">
          <Group title={t('channels', 'Channels')} go={go} tiles={brand.channels.map((c) => ({ label: c.name }))} />
          <Group title={t('rules_and_history', 'Rules and history')} go={go} tiles={[
            { label: t('profile_tips', 'Profile tips'), tab: 'profile' },
            { label: t('before_publishing', 'Before publishing'), count: n('review'), tab: 'review' },
            { label: t('past_posts', 'Past posts'), count: n('history'), tab: 'history' },
          ]} />
        </div>
      </div>
    </section>
  );
};
// <<< SANAD-BRANDS
