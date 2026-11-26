'use client';
// >>> SANAD-BRANDS: Content mix tab: the brand's posts counted by goal, format and pillar (bars scaled to the largest),
// then the plan's own suggested posting times (the imported "mix" text section).
import { FC, ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Card, contentMix } from '@gitroom/helpers/brands/post.rules';
import { dirOf } from './brands.api';

const Bars: FC<{ title: string; rows: [string, number][] }> = ({ title, rows }) => {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <section className="bg-sixth border border-fifth rounded-[12px] p-[16px] flex flex-col gap-[8px]">
      <h3 className="text-[14px] font-[600]">{title}</h3>
      {rows.map(([label, n]) => (
        <div key={label} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-[8px] text-[13px]">
          <span dir={dirOf(label)} className="truncate">{label}</span>
          <span className="h-[8px] rounded-[6px] bg-[#612BD3]" style={{ width: `${(n / max) * 100}%` }} />
          <b>{n}</b>
        </div>
      ))}
    </section>
  );
};

export const BrandMix: FC<{ cards: Card[]; children: ReactNode }> = ({ cards, children }) => {
  const t = useT();
  const m = contentMix(cards);
  return (
    <div className="flex flex-col gap-[24px]">
      {cards.length === 0 ? <div className="text-[13px] text-customColor18">{t('no_posts_yet', 'No posts yet.')}</div> : (
        <div className="grid grid-cols-3 mobile:grid-cols-1 gap-[24px] items-start">
          <Bars title={t('by_goal', 'By goal')} rows={m.byGoal} />
          <Bars title={t('by_format', 'By format')} rows={m.byFormat} />
          <Bars title={t('by_pillar', 'By pillar')} rows={m.byPillar} />
        </div>
      )}
      {children}
    </div>
  );
};
// <<< SANAD-BRANDS
