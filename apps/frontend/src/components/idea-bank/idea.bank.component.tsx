'use client';
// >>> SANAD-BRANDS: the Idea Bank page shows every brand's ideas through the Brands hub list (brand filter, No brand).
// The old free-text list is replaced; the MCP idea tools still write the old fields, read through the new view.
import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { IdeasList } from '@gitroom/frontend/components/brands/ideas.list';

export const IdeaBank: FC = () => {
  const t = useT();
  return (
    <div className="flex flex-1 min-w-0 flex-col gap-[16px] p-[24px] [@media(max-width:480px)]:p-[12px] bg-newBgColorInner">
      <h1 className="text-[20px] font-[600]">{t('idea_bank', 'Idea Bank')}</h1>
      <IdeasList scope="all" />
    </div>
  );
};
// <<< SANAD-BRANDS
