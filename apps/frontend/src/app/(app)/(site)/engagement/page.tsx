export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Engagement } from '@gitroom/frontend/components/engagement/engagement';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Engagement`,
  description: '',
};
export default async function Index() {
  return <Engagement />;
}
