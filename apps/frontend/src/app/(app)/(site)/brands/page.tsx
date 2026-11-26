export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Brands } from '@gitroom/frontend/components/brands/brands.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sanad Marketing Hub' : 'Gitroom'} Brands`,
  description: '',
};
export default async function Index() {
  return <Brands />;
}
