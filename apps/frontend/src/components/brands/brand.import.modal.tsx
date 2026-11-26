'use client';
// >>> SANAD-BRANDS: choose a plan HTML file, see what it will write (dry run), then import. The file is read as data
// by the backend; nothing in it runs.
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { errorText, useBrandsApi } from './brands.api';

interface Summary { sections: string[]; rows: Record<string, number>; posts: number }

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary', voice: 'Voice', routine: 'Engagement', profile: 'Profile tips', pillars: 'Pillars',
  bench: 'Benchmark', kpi: 'KPIs', review: 'Before publishing', history: 'Past posts', focus: 'Focus',
};

export const BrandImportModal: FC<{ brandId: string; close: () => void; onDone: () => void }> = ({ brandId, close, onDone }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const [html, setHtml] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const sectionName = (k: string) => t(`brand_section_${k}`, SECTION_LABELS[k] || k);

  const pick = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setHtml(text);
    setBusy(true);
    try { setSummary(await api.importPlan(brandId, text, true)); } catch (e) { show(errorText(e, t), 'warning'); setSummary(null); }
    setBusy(false);
  };

  const run = async () => {
    setBusy(true);
    try { await api.importPlan(brandId, html, false); show(t('plan_imported', 'Plan imported'), 'success'); onDone(); close(); } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-[16px] min-w-[480px]">
      <label className="flex flex-col gap-[8px] text-[13px] font-[600]">
        {t('plan_file', 'Plan file (HTML)')}
        <input type="file" accept=".html,text/html" onChange={(e) => pick(e.target.files?.[0])} className="text-[13px] font-[400]" />
      </label>
      {summary && (
        <div className="text-[13px] border border-fifth rounded-[8px] p-[16px] flex flex-col gap-[4px]">
          <b>{t('this_will_write', 'This will write')}</b>
          <span>{t('text_sections', 'Text sections')}: {summary.sections.map(sectionName).join(', ')}</span>
          {Object.entries(summary.rows).map(([k, v]) => <span key={k}>{sectionName(k)}: {v} {t('rows', 'rows')}</span>)}
          <span className="text-customColor18">{summary.posts} {t('posts_next_step', 'posts in the plan (added with the review loop)')}</span>
        </div>
      )}
      <div className="flex justify-end gap-[8px]">
        <button className="text-[13px] px-[16px] h-[36px] rounded-[8px]" onClick={close}>{t('cancel', 'Cancel')}</button>
        <button disabled={!summary || busy} className="text-[13px] px-[16px] h-[36px] rounded-[8px] bg-[#612BD3] text-white disabled:opacity-50" onClick={run}>{t('import', 'Import')}</button>
      </div>
    </div>
  );
};
// <<< SANAD-BRANDS
