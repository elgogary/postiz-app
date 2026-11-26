'use client';
// >>> SANAD-BRANDS: a brand-book list section edited as rows; each column has a type (rules in brand.rules.ts).
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { ROW_SECTIONS, RowSectionKey, ColumnSpec } from '@gitroom/helpers/brands/brand.rules';
import { dirOf, errorText, SectionData } from './brands.api';

type Tr = (k: string, d: string) => string;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const colLabel = (t: Tr, c: ColumnSpec) => t(`brand_col_${slug(c.label)}`, c.label);
const optLabel = (t: Tr, l: string) => t(`brand_opt_${slug(l)}`, l);

export const cellView = (t: Tr, c: ColumnSpec, v: string) => {
  if (!v) return c.empty ? <span className="text-customColor18">{t(`brand_empty_${slug(c.empty)}`, c.empty)}</span> : null;
  if (c.type === 'url') return <a href={v} target="_blank" rel="noopener noreferrer" className="text-[#612BD3]">{t('open', 'Open')}</a>;
  if (c.type === 'number') return Number(v).toLocaleString('en-GB');
  if (c.type === 'date') return new Date(`${v}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (c.type === 'month') return new Date(`${v}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  if (c.type === 'select') { const l = (c.options || []).find(([k]) => k === v)?.[1]; return l ? optLabel(t, l) : v; }
  return <span className="whitespace-pre-line">{v}</span>;
};

const inputCls = 'w-full min-w-[120px] min-h-[36px] p-[8px] bg-input border border-fifth rounded-[6px] text-[13px]';

export const BrandRowsSection: FC<{
  sectionKey: RowSectionKey; label: string; data?: SectionData; canEdit: boolean; onSave: (rows: string[][]) => Promise<void>;
  initialEditing?: boolean; onDone?: () => void;
}> = ({ sectionKey, label, data, canEdit, onSave, initialEditing, onDone }) => {
  const t = useT();
  const { show } = useToaster();
  const cols: ColumnSpec[] = ROW_SECTIONS[sectionKey];
  const rows = data?.rows || [];
  const seed = () => (rows.length ? rows.map((r) => [...r]) : [cols.map(() => '')]);
  const [draft, setDraft] = useState<string[][] | null>(initialEditing ? seed : null);
  const [busy, setBusy] = useState(false);

  const start = () => setDraft(seed());
  const cancel = () => { setDraft(null); onDone?.(); };
  const setCell = (i: number, j: number, v: string) => setDraft((d) => d!.map((r, ri) => (ri === i ? r.map((c, cj) => (cj === j ? v : c)) : r)));
  const save = async () => {
    setBusy(true);
    try {
      await onSave(draft!);
      setDraft(null);
      show(t('saved', 'Saved'), 'success');
      onDone?.();
    } catch (e) {
      show(errorText(e, t), 'warning');
    }
    setBusy(false);
  };

  const input = (c: ColumnSpec, v: string, i: number, j: number) => {
    const aria = `${colLabel(t, c)}, ${t('row', 'row')} ${i + 1}`;
    if (c.type === 'select') {
      return (
        <select aria-label={aria} className={inputCls} value={v} onChange={(e) => setCell(i, j, e.target.value)}>
          {(c.options || []).map(([k, l]) => <option key={k} value={k}>{optLabel(t, l)}</option>)}
        </select>
      );
    }
    if (c.type !== 'text') {
      return <input aria-label={aria} className={inputCls} type={c.type} min={c.type === 'number' ? 0 : undefined} value={v} onChange={(e) => setCell(i, j, e.target.value)} />;
    }
    return <textarea aria-label={aria} dir={dirOf(v)} className={inputCls} rows={Math.min(6, Math.max(2, Math.ceil(v.length / 60)))} value={v} onChange={(e) => setCell(i, j, e.target.value)} />;
  };

  return (
    <article className="bg-sixth border border-fifth rounded-[12px] p-[24px] flex flex-col gap-[16px]">
      <div className="flex items-start gap-[16px]">
        <div>
          <h3 className="text-[16px] font-[600]">{label}</h3>
          {rows.length > 0 && !draft && <div className="text-[12px] text-customColor18">{rows.length} {t('rows', 'rows')}{data?.updatedBy ? ` · ${data.updatedBy}` : ''}</div>}
        </div>
        {canEdit && !draft && (
          <button className="ms-auto text-[13px] px-[16px] h-[36px] rounded-[8px] hover:bg-newColColor" onClick={start}>{t('edit', 'Edit')}</button>
        )}
      </div>
      {data?.note && !draft && <p className="text-[13px] text-customColor18" dir={dirOf(data.note)}>{data.note}</p>}
      {draft ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr>{cols.map((c) => <th key={c.label} className="text-start p-[8px] bg-newColColor font-[600]">{colLabel(t, c)}</th>)}<th><span className="sr-only">{t('delete', 'Delete')}</span></th></tr></thead>
              <tbody>
                {draft.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c, j) => <td key={c.label} className="p-[4px] align-top">{input(c, r[j] || '', i, j)}</td>)}
                    <td className="p-[4px] align-middle">
                      <button aria-label={`${t('delete_row', 'Delete row')} ${i + 1}`} className="w-[36px] h-[36px] rounded-[6px] hover:bg-newColColor" onClick={() => setDraft((d) => d!.filter((_, k) => k !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-[8px]">
            <button className="text-[13px] px-[16px] h-[36px] rounded-[8px] border border-fifth" onClick={() => setDraft((d) => [...d!, cols.map(() => '')])}>+ {t('add_row', 'Add row')}</button>
            <button className="ms-auto text-[13px] px-[16px] h-[36px] rounded-[8px]" onClick={cancel}>{t('cancel', 'Cancel')}</button>
            <button disabled={busy} className="text-[13px] px-[16px] h-[36px] rounded-[8px] bg-[#612BD3] text-white disabled:opacity-50" onClick={save}>{t('save', 'Save')}</button>
          </div>
        </>
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{cols.map((c) => <th key={c.label} className="text-start p-[8px] bg-newColColor font-[600]">{colLabel(t, c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-fifth">{cols.map((c, j) => <td key={c.label} dir={dirOf(r[j] || '')} className="p-[8px] align-top text-start">{cellView(t, c, r[j] || '')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <p className="text-[14px] text-customColor18">{t('not_written_yet', 'Not written yet.')}</p>
      )}
    </article>
  );
};
// <<< SANAD-BRANDS
