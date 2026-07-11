export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { IdeaBank } from '@gitroom/frontend/components/idea-bank/idea.bank.component';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sanad Marketing Hub' : 'Gitroom'} Idea Bank`,
  description: '',
};
export default async function Index() {
  return <IdeaBank />;
}
