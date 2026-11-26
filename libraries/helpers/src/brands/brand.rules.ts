// >>> SANAD-BRANDS: rules shared by the backend and the frontend; pure, no imports.
export type BrandRole = 'view' | 'create' | 'approve';
export type AccessRole = 'VIEW' | 'CREATE' | 'APPROVE';
export type OrgRole = 'USER' | 'ADMIN' | 'SUPERADMIN';
export type CellType = 'text' | 'url' | 'number' | 'date' | 'month' | 'select';

export interface ColumnSpec {
  label: string;
  type: CellType;
  options?: [string, string][];
  empty?: string;
}

export const TEXT_SECTIONS = ['summary', 'voice', 'routine', 'profile', 'mix'] as const;
export type TextSectionKey = (typeof TEXT_SECTIONS)[number];

const text = (label: string): ColumnSpec => ({ label, type: 'text' });

export const ROW_SECTIONS = {
  pillars: [text('Pillar')],
  bench: [text('Account'), { label: 'Link', type: 'url' }, { label: 'Followers', type: 'number' },
    { label: 'Checked on', type: 'date', empty: 'Not checked' }, text('How they write'), text('What works for them'),
    text('Take or avoid')],
  kpi: [text('Measure'), text('What we count'), text('Target this month')],
  review: [text('Check')],
  history: [{ label: 'Month', type: 'month' }, { label: 'Source', type: 'select', options: [['ours', 'Ours'], ['competitor', 'Competitor']] },
    text('Idea')],
  focus: [{ label: 'Start', type: 'date' }, { label: 'End', type: 'date' }, text('Theme'), text('Description')],
} satisfies Record<string, ColumnSpec[]>;
export type RowSectionKey = keyof typeof ROW_SECTIONS;

export const isTextSection = (k: string): k is TextSectionKey => (TEXT_SECTIONS as readonly string[]).includes(k);
export const isRowSection = (k: string): k is RowSectionKey => Object.prototype.hasOwnProperty.call(ROW_SECTIONS, k);

export const isOrgAdmin = (o: OrgRole) => o === 'ADMIN' || o === 'SUPERADMIN';

export function resolveBrandRole(orgRole: OrgRole, access?: AccessRole | null): BrandRole {
  if (isOrgAdmin(orgRole) || access === 'APPROVE') return 'approve';
  if (access === 'CREATE') return 'create';
  return 'view';
}

export const canEdit = (r: BrandRole) => r === 'create' || r === 'approve';
export const canApprove = (r: BrandRole) => r === 'approve';

const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

function checkCell(col: ColumnSpec, cell: unknown, rowNo: number): string {
  const v = cell === null || cell === undefined ? '' : String(cell).trim();
  if (v === '') return '';
  if (v.length > 4000) throw new Error(`Row ${rowNo}, ${col.label}: too long`);
  const bad = () => new Error(`Row ${rowNo}, ${col.label}: "${v}" is not a valid ${col.type}`);
  if (col.type === 'url' && !/^https?:\/\/\S+$/.test(v)) throw bad();
  if (col.type === 'number' && !/^\d+(\.\d+)?$/.test(v)) throw bad();
  if (col.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !isRealDate(v))) throw bad();
  if (col.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw bad();
  if (col.type === 'select' && !(col.options || []).some(([k]) => k === v)) throw bad();
  return v;
}

export function validateRows(key: string, rows: unknown): string[][] {
  if (!isRowSection(key)) throw new Error(`Unknown section ${key}`);
  const cols: ColumnSpec[] = ROW_SECTIONS[key];
  if (!Array.isArray(rows) || rows.length > 200) throw new Error('Rows must be a list of at most 200 rows');
  return rows
    .map((row, i) => {
      if (!Array.isArray(row) || row.length !== cols.length) throw new Error(`Row ${i + 1} must have ${cols.length} cells`);
      const cells = row.map((cell, j) => checkCell(cols[j], cell, i + 1));
      if (key === 'focus' && cells[0] && cells[1] && cells[1] < cells[0]) throw new Error(`Row ${i + 1}: the end date is before the start date`);
      return cells;
    })
    .filter((r) => r.some((c) => c !== ''));
}

const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'br', 'h3', 'h4', 'a']);

export function cleanHtml(html: string): string {
  if (html.length > 100000) throw new Error('Text too long');
  let src = html;
  for (let prev = ''; prev !== src; ) {
    prev = src;
    src = src.replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '');
  }
  const esc = (t: string) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = /<\/?([a-z0-9]+)\b[^<>]*>/gi;
  let out = '';
  let last = 0;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[1].toLowerCase();
    if (!ALLOWED.has(t)) continue;
    if (m[0].startsWith('</')) out += `</${t}>`;
    else if (t === 'a') {
      const href = /href\s*=\s*"(https?:\/\/[^"]*)"/i.exec(m[0]);
      out += href ? `<a href="${href[1]}" target="_blank" rel="noopener noreferrer">` : '<a>';
    } else out += `<${t}>`;
  }
  return out + esc(src.slice(last));
}

export function weekOf(focusRows: string[][], iso: string): number {
  return focusRows.findIndex(([start, end]) => iso >= start && iso <= end) + 1;
}
// <<< SANAD-BRANDS
