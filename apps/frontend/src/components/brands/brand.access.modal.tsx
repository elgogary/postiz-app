'use client';
// >>> SANAD-BRANDS: who may view, create or approve on one brand, and the brand's approval switch. Admin only (backend checks too).
import { FC, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { AccessPerson, errorText, useBrandsApi } from './brands.api';

export const BrandAccessModal: FC<{ brandId: string; close: () => void; onSaved: () => void }> = ({ brandId, close, onSaved }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const [approval, setApproval] = useState(true);
  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [changed, setChanged] = useState<Record<string, string>>({});

  useEffect(() => { api.access(brandId).then((a) => { setApproval(a.requiresApproval); setPeople(a.people); }).catch((e) => show(errorText(e, t), 'warning')); }, [brandId]);

  const save = async () => {
    try {
      await api.setSettings(brandId, approval);
      for (const [userId, role] of Object.entries(changed)) await api.setAccess(brandId, userId, role);
      show(t('access_saved', 'Access saved'), 'success');
      onSaved();
      close();
    } catch (e) {
      show(errorText(e, t), 'warning');
    }
  };

  return (
    <div className="flex flex-col gap-[16px] min-w-[min(480px,calc(100vw_-_64px))]">
      <label className="flex items-center gap-[16px] py-[8px] border-b border-fifth">
        <span className="flex flex-col">
          <span className="text-[14px] font-[600]">{t('posts_need_approval', 'Posts need approval')}</span>
          <span className="text-[12px] text-customColor18">{t('approval_help', 'When on, a post is scheduled only after an approver approves it.')}</span>
        </span>
        <input type="checkbox" role="switch" className="ms-auto w-[44px] h-[24px] max-[480px]:h-[44px] accent-[#612BD3]" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
      </label>
      {people.map((p) => (
        <div key={p.userId} className="flex items-center gap-[16px] py-[8px] border-b border-fifth">
          <div className="flex flex-col">
            <span className="text-[14px] font-[600]">{p.name}</span>
            <span className="text-[12px] text-customColor18">{p.locked ? t('admin', 'Admin') : t('team_member', 'Team member')}</span>
          </div>
          {p.locked ? (
            <span className="ms-auto text-[13px] text-customColor18">{t('approves_every_brand', 'Approves every brand')}</span>
          ) : (
            <div role="group" aria-label={`${p.name} ${t('access', 'Access').toLowerCase()}`} className="ms-auto inline-flex border border-fifth rounded-[8px] overflow-hidden">
              {(['VIEW', 'CREATE', 'APPROVE'] as const).map((r) => {
                const on = (changed[p.userId] || p.access) === r;
                return (
                  <button key={r} aria-pressed={on} onClick={() => setChanged((c) => ({ ...c, [p.userId]: r }))}
                    className={`px-[16px] h-[36px] max-[480px]:h-[44px] text-[13px] ${on ? 'bg-[#612BD3] text-white font-[600]' : ''}`}>
                    {r === 'VIEW' ? t('view', 'View') : r === 'CREATE' ? t('create', 'Create') : t('approve', 'Approve')}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div className="flex justify-end gap-[8px]">
        <button className="text-[13px] px-[16px] h-[36px] max-[480px]:h-[44px] rounded-[8px]" onClick={close}>{t('cancel', 'Cancel')}</button>
        <button className="text-[13px] px-[16px] h-[36px] max-[480px]:h-[44px] rounded-[8px] bg-[#612BD3] text-white" onClick={save}>{t('save', 'Save')}</button>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
