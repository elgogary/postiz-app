'use client';
// >>> SANAD-BRANDS: Posts tab: state filters with counts, then the cards (review first, then sent back, drafts, ...).
import { FC, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { STATE_LABEL } from '@gitroom/helpers/brands/post.rules';
import type { BrandPosts } from './brands.api';
import { BrandPostCard } from './brand.post.card';

const FILTERS = ['all', 'review', 'changes', 'planned', 'draft', 'scheduled', 'published'] as const;

export const BrandPostsTab: FC<{
  brandId: string; data: BrandPosts; filter: string; focus: string; setFilter: (f: string) => void;
  onChanged: () => void; goChecks: () => void; onNew: (() => void) | null;
}> = ({ brandId, data, filter, focus, setFilter, onChanged, goChecks, onNew }) => {
  const t = useT();
  const [open, setOpen] = useState<string>(focus);
  useEffect(() => {
    if (focus) document.getElementById(`post-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus]);
  const count = (f: string) => (f === 'all' ? data.cards.length : data.cards.filter((c) => c.state === f).length);
  const shown = filter === 'all' ? data.cards : data.cards.filter((c) => c.state === filter);
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap gap-[8px]">
        {FILTERS.map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`text-[13px] px-[12px] h-[32px] [@media(max-width:480px)]:h-[44px] rounded-[6px] border ${filter === f ? 'border-[#612BD3] text-[#5221b8] dark:text-[#c4b5fd] bg-[#612BD3]/10' : 'border-fifth'}`}>
            {f === 'all' ? t('all', 'All') : t(`state_${f}`, STATE_LABEL[f])} {count(f)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="flex items-center gap-[16px] text-[14px] text-customColor18">
          {t('no_posts_here', 'No posts here yet.')}
          {onNew && <button className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] bg-[#612BD3] text-white" onClick={onNew}>{t('new_post', 'New post')}</button>}
        </div>
      ) : shown.map((c) => (
        <BrandPostCard key={c.key} brandId={brandId} card={c} role={data.role} requiresApproval={data.requiresApproval}
          checks={data.checks} open={open === c.key} onToggle={() => setOpen(open === c.key ? '' : c.key)}
          onChanged={onChanged} goChecks={goChecks} />
      ))}
    </div>
  );
};
// <<< SANAD-BRANDS
