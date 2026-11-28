'use client';
// >>> SANAD-BRANDS: the Trends page lists every brand's weekly trends through the shared list. The header already
// shows the page title, so none is drawn here.
import { FC } from 'react';
import { TrendsList } from '@gitroom/frontend/components/brands/trends.list';

export const TrendsPage: FC = () => (
  <div className="flex flex-1 min-w-0 flex-col gap-[16px] p-[24px] [@media(max-width:480px)]:p-[12px] bg-newBgColorInner">
    <TrendsList scope="all" />
  </div>
);
// <<< SANAD-BRANDS
