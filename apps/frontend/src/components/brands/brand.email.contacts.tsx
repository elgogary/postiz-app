'use client';
// >>> SANAD-BRANDS: one list's contacts (brand approvers; the server answers 403 to anyone else), 50 a page.
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { EmailContact, EmailListRow } from '@gitroom/helpers/brands/email.rules';
import { errorText, useBrandsApi } from './brands.api';
import { Chip, EmailGo, fmtDate, QUIET, Retry, Skeleton, TD, TH, TONE, Text } from './brand.email.ui';

const PAGE = 50;
const STATUS: Record<EmailContact['status'], [string, string]> = {
  subscribed: [TONE.green, 'Subscribed'], unsubscribed: [TONE.grey, 'Unsubscribed'], unconfirmed: [TONE.amber, 'Not confirmed'], blocklisted: [TONE.amber, 'Blocked'],
};

export const EmailContactsView: FC<{ brandId: string; list: EmailListRow; go: EmailGo }> = ({ brandId, list, go }) => {
  const t = useT();
  const api = useBrandsApi();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ contacts: EmailContact[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const tt = useRef(t);
  tt.current = t;

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    try {
      const d = await api.emailContacts(brandId, list.channelId, list.id, page);
      if (mine === seq.current) setData(d);
    } catch (e) {
      if (mine === seq.current) setError(errorText(e, tt.current));
    }
  }, [api, brandId, list.channelId, list.id, page]);
  useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[13px] text-customColor18">
        <button className="font-[600] text-[#5221b8] dark:text-[#c4b5fd] [@media(max-width:480px)]:min-h-[44px]" onClick={() => go({ tab: 'email', filter: 'lists' })}>{t('email_lists', 'Lists')}</button> / <Text text={list.name} />
      </div>
      {error && !data ? <Retry text={error} onRetry={load} /> : !data ? <Skeleton /> : (
        <>
          <div className="overflow-x-auto border border-fifth rounded-[12px]">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr>
                  <th className={TH}>{t('email_address', 'Email')}</th><th className={TH}>{t('email_name', 'Name')}</th>
                  <th className={`${TH} w-[140px]`}>{t('email_status', 'Status')}</th><th className={`${TH} w-[140px]`}>{t('email_added', 'Added')}</th>
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((c) => (
                  <tr key={c.email}>
                    <td className={TD}><bdi dir="ltr">{c.email}</bdi></td>
                    <td className={TD}><Text text={c.name} /></td>
                    <td className={TD}><Chip tone={STATUS[c.status][0]}>{t(`email_contact_${c.status}`, STATUS[c.status][1])}</Chip></td>
                    <td className={TD}>{fmtDate(c.added)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > PAGE && (
            <div className="flex items-center gap-[16px] text-[13px]">
              <button className={QUIET} disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('previous', 'Previous')}</button>
              <span className="tabular-nums">{page} / {pages}</span>
              <button className={QUIET} disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('next', 'Next')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
// <<< SANAD-BRANDS
