'use client';
// >>> SANAD-BRANDS: Focus shows each week as a card; Edit opens the same rows editor (Start, End, Theme, Description).
// Plan 2 lists each week's posts inside its card (a post's week comes from its date, weekOf in brand.rules.ts).
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { BrandRowsSection } from './brand.rows.section';
import { dirOf, type SectionData } from './brands.api';

const short = (iso: string) => (!iso ? '' : new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

export const BrandFocus: FC<{ data?: SectionData; canEdit: boolean; onSave: (rows: string[][]) => Promise<void> }> = ({ data, canEdit, onSave }) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const rows = data?.rows || [];
  if (editing) {
    return <BrandRowsSection sectionKey="focus" label={t('focus', 'Focus')} data={data} canEdit initialEditing onDone={() => setEditing(false)} onSave={onSave} />;
  }
  return (
    <article className="bg-sixth border border-fifth rounded-[12px] p-[24px] flex flex-col gap-[16px]">
      <div className="flex items-start gap-[16px]">
        <h3 className="text-[16px] font-[600]">{t('focus', 'Focus')}</h3>
        {canEdit && <button className="ms-auto text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] hover:bg-newColColor" onClick={() => setEditing(true)}>{t('edit', 'Edit')}</button>}
      </div>
      {rows.length ? (
        <div className="grid gap-[16px] [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {rows.map(([start, end, theme, desc], i) => (
            <div key={i} className="border border-fifth rounded-[8px] p-[16px] flex flex-col gap-[8px]">
              <div className="flex justify-between text-[12px]">
                <span className="px-[8px] rounded-[6px] bg-newColColor">{t('week', 'Week')} {i + 1}</span>
                <span className="text-customColor18">{[short(start), short(end)].filter(Boolean).join(` ${t('to', 'to')} `)}</span>
              </div>
              <h4 className="text-[14px] font-[600]" dir={dirOf(theme)}>{theme}</h4>
              <p className="text-[13px] text-customColor18 leading-[1.6]" dir={dirOf(desc)}>{desc}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-customColor18">{t('no_plan_yet', 'No plan for this brand yet.')}</p>
      )}
    </article>
  );
};
// <<< SANAD-BRANDS
