'use client';
// >>> SANAD-BRANDS: the Lists view: who is on each list and whether they agreed to hear from the brand. Brand approvers
// also get Import contacts and can open a list to see its contacts.
import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';
import type { ConsentKind, EmailOverview } from '@gitroom/helpers/brands/email.rules';
import { EmailContactsView } from './brand.email.contacts';
import { EmailImportModal } from './brand.email.import';
import { Chip, EmailGo, EmailSwitch, fmtDate, NUM, QUIET, TD, TH, TONE, Text } from './brand.email.ui';

const CONSENT: Record<ConsentKind, [string, string, string]> = {
  agreed: [TONE.green, 'email_consent_agreed', 'Agreed when signing up'],
  team: [TONE.purple, 'email_consent_team', 'Our team'],
  none: [TONE.amber, 'email_consent_none', 'Not recorded'],
};

export const BrandEmailLists: FC<{
  brandId: string; brandName: string; role: BrandRole; data: EmailOverview; campaigns: number;
  list: { channelId: string; id: number } | null; go: EmailGo; onChanged: () => void;
}> = ({ brandId, brandName, role, data, campaigns, list, go, onChanged }) => {
  const t = useT();
  const modals = useModals();
  const approver = role === 'approve';
  const open = list && approver ? data.lists.find((l) => l.channelId === list.channelId && l.id === list.id) : null;
  if (open) return <EmailContactsView key={`${open.channelId}:${open.id}`} brandId={brandId} list={open} go={go} />;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-[16px] flex-wrap">
        <EmailSwitch on="lists" campaigns={campaigns} lists={data.lists.length} go={go} />
        {approver && data.lists.length > 0 && (
          <button className={`${QUIET} ms-auto`} onClick={() => modals.openModal({
            title: t('email_import_contacts', 'Import contacts'), closeOnClickOutside: true, closeOnEscape: true,
            children: (close: () => void) => <EmailImportModal brandId={brandId} brandName={brandName} lists={data.lists} close={close} onDone={onChanged} />,
          })}>{t('email_import_contacts', 'Import contacts')}</button>
        )}
      </div>
      {data.lists.length === 0 ? (
        <div className="text-[14px] text-customColor18">{t('email_no_lists', 'No lists yet.')}</div>
      ) : (
        <div className="overflow-x-auto border border-fifth rounded-[12px]">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[14px]">
            <thead>
              <tr>
                <th className={TH}>{t('email_list', 'List')}</th>
                <th className={`${TH} ${NUM} w-[112px]`}>{t('email_contacts', 'Contacts')}</th>
                <th className={`${TH} ${NUM} w-[128px]`}>{t('email_unsubscribed', 'Unsubscribed')}</th>
                <th className={`${TH} w-[220px]`}>{t('email_agreed_to_hear', 'Agreed to hear from')} <Text text={brandName} /></th>
                <th className={`${TH} w-[184px]`}>{t('email_last', 'Last email')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lists.map((l) => {
                const [tone, key, text] = CONSENT[l.consent];
                const go1 = () => go({ tab: 'email', filter: 'lists', focus: `l:${l.channelId}:${l.id}` });
                return (
                  <tr key={`${l.channelId}:${l.id}`} onClick={approver ? go1 : undefined} className={approver ? 'cursor-pointer hover:bg-sixth' : ''}>
                    <td className={TD}>
                      {approver
                        ? <button className="text-start font-[600]" onClick={(e) => { e.stopPropagation(); go1(); }}><Text text={l.name} /></button>
                        : <span className="font-[600]"><Text text={l.name} /></span>}
                      {l.source === 'brevo' && <div className="text-[12px] text-customColor18">{t('email_from_brevo', 'From Brevo')}</div>}
                    </td>
                    <td className={`${TD} ${NUM}`}>{l.contacts}</td>
                    <td className={`${TD} ${NUM}`}>{l.unsubscribed}</td>
                    <td className={TD}><Chip tone={tone}>{t(key, text)}</Chip></td>
                    <td className={TD}>{fmtDate(l.lastEmail)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
// <<< SANAD-BRANDS
