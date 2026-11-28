'use client';
// >>> SANAD-BRANDS: Import contacts (brand approvers): pick the list, a .csv file and the one required tick. The
// server reads the file, checks every address and records the agreement on each person.
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { EmailListRow } from '@gitroom/helpers/brands/email.rules';
import { listLabel } from '@gitroom/helpers/brands/email.rules';
import { errorText, useBrandsApi } from './brands.api';
import { QUIET, Text } from './brand.email.ui';

export const EmailImportModal: FC<{ brandId: string; brandName: string; lists: EmailListRow[]; close: () => void; onDone: () => void }> = ({ brandId, brandName, lists, close, onDone }) => {
  const t = useT();
  const api = useBrandsApi();
  const first = lists.find((l) => l.consent === 'agreed') || lists[0];
  const [at, setAt] = useState(first ? `${first.channelId}:${first.id}` : '');
  const [file, setFile] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ processed: number; skipped: number } | null>(null);

  const run = async () => {
    const [channelId, id] = at.split(':');
    if (!file || !agreed || !channelId) return;
    setBusy(true);
    setError('');
    try {
      setDone(await api.emailImport(brandId, channelId, +id, file));
      onDone();
    } catch (e) { setError(errorText(e, t)); }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="flex flex-col gap-[16px] min-w-[min(480px,calc(100vw_-_64px))]">
        <div className="text-[14px]">{done.processed} {t('email_contacts_processed', 'contacts processed')}, {done.skipped} {t('email_rows_invalid', 'rows without a valid address')}</div>
        <div className="flex justify-end"><button className={QUIET} onClick={close}>{t('close', 'Close')}</button></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[16px] min-w-[min(480px,calc(100vw_-_64px))]">
      <label className="flex flex-col gap-[8px] text-[13px] font-[600]">
        {t('email_import_list', 'List')}
        <select value={at} onChange={(e) => setAt(e.target.value)} className="min-h-[36px] bg-input border border-fifth rounded-[8px] px-[8px] font-[400]">
          {lists.map((l) => <option key={`${l.channelId}:${l.id}`} value={`${l.channelId}:${l.id}`}>{listLabel(l.name, brandName)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-[8px] text-[13px] font-[600]">
        {t('email_import_file', 'File (.csv)')}
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-[13px] font-[400]" />
      </label>
      <label className="flex items-center gap-[8px] text-[13px] [@media(max-width:480px)]:min-h-[44px]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{t('email_import_agreed', 'These people agreed to hear from')} <Text text={brandName} /></span>
      </label>
      {error && <div role="alert" className="text-[13px] text-[#a51d1d] dark:text-[#ffa8a8]">{error}</div>}
      <div className="flex justify-end gap-[8px]">
        <button className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px]" onClick={close}>{t('cancel', 'Cancel')}</button>
        <button disabled={!file || !agreed || busy} className="text-[13px] font-[600] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] bg-[#612BD3] text-white disabled:opacity-50" onClick={run}>{t('import', 'Import')}</button>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
