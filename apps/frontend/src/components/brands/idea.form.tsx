'use client';
// >>> SANAD-BRANDS: add or edit an idea (prototype idea dialog). Pillar options are the ticked brands' Pillars rows,
// live as brands are ticked. Refine with AI reuses the Idea Bank's existing refine route.
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { FORMATS } from '@gitroom/helpers/brands/post.rules';
import { IdeaView, composeIdeaText, parseIdeaText, pillarsFor } from '@gitroom/helpers/brands/idea.rules';
import { IdeasData, dirOf, errorText, useBrandsApi } from './brands.api';

const FIELD = 'w-full p-[8px] bg-input border border-fifth rounded-[6px] text-[13px]';
const BTN = 'text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] disabled:opacity-50';

export const IdeaForm: FC<{ data: IdeasData; idea: IdeaView | null; brandId: string | null; close: () => void; onDone: () => void }> = ({ data, idea, brandId, close, onDone }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const [hook, setHook] = useState(idea?.hook || '');
  const [angle, setAngle] = useState(idea?.angle || '');
  const [bullets, setBullets] = useState((idea?.bullets || []).join('\n'));
  const [brands, setBrands] = useState<string[]>(idea?.brandIds || (brandId ? [brandId] : []));
  const [topic, setTopic] = useState(idea?.topic || 'General');
  const [format, setFormat] = useState<string>(idea?.format || '');
  const [pillars, setPillars] = useState<string[]>(idea?.pillars || []);
  const [source, setSource] = useState(idea?.source || '');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState(false);
  const options = pillarsFor(brands, Object.fromEntries(data.brands.map((b) => [b.id, b.pillars])));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const lines = () => bullets.split('\n').map((l) => l.trim()).filter(Boolean);

  const refine = async () => {
    setBusy(true);
    try {
      const { refined } = await api.refineIdea(composeIdeaText({ hook, angle, bullets: lines() }));
      const p = parseIdeaText(refined);
      setHook(p.hook); setAngle(p.angle); if (p.bullets.length) setBullets(p.bullets.join('\n'));
    } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy(false);
  };
  const save = async () => {
    if (!hook.trim()) { setBad(true); show(t('write_the_hook', 'Write the hook'), 'warning'); return; }
    setBusy(true);
    const body = { hook, angle, bullets: lines(), brandIds: brands, topic, pillars: pillars.filter((p) => options.includes(p)), format, source };
    try {
      if (idea) await api.saveIdea(idea.id, body); else await api.addIdea(body);
      show(idea ? t('idea_saved', 'Idea saved') : t('idea_added', 'Idea added'), 'success');
      onDone();
      close();
    } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-[12px] min-w-[min(560px,calc(100vw_-_64px))] text-[13px]">
      <label className="flex flex-col gap-[4px]">{t('hook', 'Hook')} <span className="text-[11px] text-customColor18">{t('required', 'required')}</span>
        <textarea autoFocus rows={2} dir={dirOf(hook)} aria-invalid={bad} className={FIELD} value={hook} onChange={(e) => { setHook(e.target.value); setBad(false); }} />
      </label>
      <label className="flex flex-col gap-[4px]">{t('angle', 'Angle')}
        <textarea rows={2} dir={dirOf(angle)} className={FIELD} value={angle} onChange={(e) => setAngle(e.target.value)} />
      </label>
      <label className="flex flex-col gap-[4px]">{t('bullets', 'Bullets')} <span className="text-[11px] text-customColor18">{t('one_per_line', 'one per line')}</span>
        <textarea rows={3} dir={dirOf(bullets)} className={FIELD} value={bullets} onChange={(e) => setBullets(e.target.value)} />
      </label>
      <fieldset className="flex flex-wrap gap-[12px]"><legend className="mb-[4px]">{t('brand', 'Brand')}</legend>
        {data.brands.map((b) => (
          <label key={b.id} className="flex items-center gap-[6px]"><input type="checkbox" className="w-[18px] h-[18px]" checked={brands.includes(b.id)} onChange={() => setBrands(toggle(brands, b.id))} />{b.name}</label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 [@media(max-width:480px)]:grid-cols-1 gap-[12px]">
        <label className="flex flex-col gap-[4px]">{t('topic', 'Topic')}
          <select className={FIELD} value={topic} onChange={(e) => setTopic(e.target.value)}>
            {data.topics.map((x) => <option key={x} value={x}>{t(`topic_${x.toLowerCase().replace(/[^a-z]+/g, '_')}`, x)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[4px]">{t('suggested_format', 'Suggested format')}
          <select className={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">{t('not_decided', 'Not decided')}</option>
            {FORMATS.map((f) => <option key={f} value={f}>{t(`format_${f.toLowerCase()}`, f)}</option>)}
          </select>
        </label>
      </div>
      {options.length > 0 && (
        <fieldset className="flex flex-wrap gap-[12px]"><legend className="mb-[4px]">{t('pillar', 'Pillar')}</legend>
          {options.map((p) => (
            <label key={p} className="flex items-center gap-[6px]"><input type="checkbox" className="w-[18px] h-[18px]" checked={pillars.includes(p)} onChange={() => setPillars(toggle(pillars, p))} />{p}</label>
          ))}
        </fieldset>
      )}
      <label className="flex flex-col gap-[4px]">{t('source', 'Source')} <span className="text-[11px] text-customColor18">{t('source_help', 'link or where it came from')}</span>
        <input className={`${FIELD} h-[36px]`} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <div className="flex flex-wrap justify-end gap-[8px]">
        <button className={`${BTN} border border-fifth me-auto`} disabled={busy || !hook.trim()} onClick={refine}>{t('refine_with_ai', 'Refine with AI')}</button>
        <button className={`${BTN} border border-fifth`} onClick={close}>{t('cancel', 'Cancel')}</button>
        <button className={`${BTN} bg-[#612BD3] text-white`} disabled={busy} onClick={save}>{t('save', 'Save')}</button>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
