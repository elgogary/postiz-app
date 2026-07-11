export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { MyLinkedin } from '@gitroom/frontend/components/my-linkedin/my.linkedin.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sanad Marketing Hub' : 'Gitroom'} My LinkedIn`,
  description: '',
};
export default async function Index() {
  return <MyLinkedin />;
}
