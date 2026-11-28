export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { TrendsPage } from '@gitroom/frontend/components/trends/trends.page.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sanad Marketing Hub' : 'Gitroom'} Trends`,
  description: '',
};
export default async function Index() {
  return <TrendsPage />;
}
