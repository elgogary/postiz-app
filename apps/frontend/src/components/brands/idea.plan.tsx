'use client';
// >>> SANAD-BRANDS: Plan this idea (prototype plan dialog): brand (only when the idea has several), date, format, and
// "Write the first draft with AI" on by default (spec rule 7).
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { FORMATS, localToUtc } from '@gitroom/helpers/brands/post.rules';
import type { IdeaView } from '@gitroom/helpers/brands/idea.rules';
import { IdeasData, dirOf, errorText, useBrandsApi } from './brands.api';

const FIELD = 'w-full h-[36px] px-[8px] bg-input border border-fifth rounded-[6px] text-[13px]';
const BTN = 'text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] disabled:opacity-50';
const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// The post goes out at 09:30 local time; once that has passed today, the first day left is tomorrow.
const firstDay = () => {
  const now = new Date();
  const late = now.getHours() * 60 + now.getMinutes() >= 9 * 60 + 30;
  return ymd(late ? new Date(now.getTime() + 86400000) : now);
};

export const IdeaPlan: FC<{ data: IdeasData; idea: IdeaView; brandId: string | null; close: () => void; onDone: () => void }> = ({ data, idea, brandId, close, onDone }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const may = data.brands.filter((b) => b.role === 'create' || b.role === 'approve');
  const choices = (idea.brandIds.length ? may.filter((b) => idea.brandIds.includes(b.id)) : may);
  const [brand, setBrand] = useState(choices.find((b) => b.id === brandId)?.id || choices[0]?.id || '');
  const min = firstDay();
  const [day, setDay] = useState(min);
  const [format, setFormat] = useState<string>(idea.format || 'Text');
  const [ai, setAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const name = data.brands.find((b) => b.id === brand)?.name || '';

  const submit = async () => {
    if (!day || day < min) { setBad(true); show(t('pick_the_date', 'Pick the date'), 'warning'); return; }
    setBusy(true);
    try {
      const res = await api.planIdea(idea.id, { customerId: brand, date: localToUtc(day, '09:30', new Date().getTimezoneOffset()), format, ai });
      const when = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
      show(res.firstDraft
        ? t('first_draft_written', 'First draft written for {day}: check it in Posts').replace('{day}', when)
        : res.aiFailed
          ? t('ai_draft_failed', 'The first draft could not be written: planned for {day} in {brand} without a draft').replace('{day}', when).replace('{brand}', name)
          : t('planned_for', 'Planned for {day} in {brand}').replace('{day}', when).replace('{brand}', name), res.aiFailed ? 'warning' : 'success');
      onDone();
      close();
    } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-[12px] min-w-[min(480px,calc(100vw_-_64px))] text-[13px]">
      <div dir={dirOf(idea.hook)} className="font-[600]">{idea.hook}</div>
      {choices.length > 1 && (
        <label className="flex flex-col gap-[4px]">{t('brand', 'Brand')}
          <select className={FIELD} value={brand} onChange={(e) => setBrand(e.target.value)}>{choices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
      )}
      <label className="flex flex-col gap-[4px]">{t('date', 'Date')} <span className="text-[11px] text-customColor18">{t('required', 'required')}</span>
        <input autoFocus type="date" min={min} aria-invalid={bad} className={FIELD} value={day} onChange={(e) => { setDay(e.target.value); setBad(false); }} />
      </label>
      <label className="flex flex-col gap-[4px]">{t('format', 'Format')}
        <select className={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map((f) => <option key={f} value={f}>{t(`format_${f.toLowerCase()}`, f)}</option>)}</select>
      </label>
      <label className="flex gap-[8px] items-start">
        <input type="checkbox" className="mt-[2px] w-[18px] h-[18px]" checked={ai} onChange={(e) => setAi(e.target.checked)} />
        <span>{t('write_first_draft_ai', 'Write the first draft with AI')}<span className="block text-[12px] text-customColor18">{t('first_draft_help', "Caption in the brand's voice rules, plus slide text or a video script. Saved as a draft to check.")}</span></span>
      </label>
      <div className="flex justify-end gap-[8px]">
        <button className={`${BTN} border border-fifth`} onClick={close}>{t('cancel', 'Cancel')}</button>
        <button className={`${BTN} bg-[#612BD3] text-white`} disabled={busy || !brand} onClick={submit}>
          {busy && ai ? t('writing_the_draft', 'Writing the draft…') : t('add_to_the_plan', 'Add to the plan')}
        </button>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
