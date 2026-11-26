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

export const TEXT_SECTIONS = ['summary', 'voice', 'routine', 'profile'] as const;
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

function checkCell(col: ColumnSpec, cell: unknown, rowNo: number): string {
  const v = cell === null || cell === undefined ? '' : String(cell).trim();
  if (v === '') return '';
  if (v.length > 4000) throw new Error(`Row ${rowNo}, ${col.label}: too long`);
  const bad = () => new Error(`Row ${rowNo}, ${col.label}: "${v}" is not a valid ${col.type}`);
  if (col.type === 'url' && !/^https?:\/\/\S+$/.test(v)) throw bad();
  if (col.type === 'number' && !/^\d+(\.\d+)?$/.test(v)) throw bad();
  if (col.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))) throw bad();
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
      return row.map((cell, j) => checkCell(cols[j], cell, i + 1));
    })
    .filter((r) => r.some((c) => c !== ''));
}

const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'br', 'h3', 'h4', 'a']);

export function cleanHtml(html: string): string {
  if (html.length > 100000) throw new Error('Text too long');
  return html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (whole, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.has(t)) return '';
      if (whole.startsWith('</')) return `</${t}>`;
      if (t === 'br') return '<br>';
      if (t === 'a') {
        const href = /href\s*=\s*"(https?:\/\/[^"]*)"/i.exec(attrs);
        return href ? `<a href="${href[1]}" target="_blank" rel="noopener noreferrer">` : '<a>';
      }
      return `<${t}>`;
    });
}

export function weekOf(focusRows: string[][], iso: string): number {
  return focusRows.findIndex(([start, end]) => iso >= start && iso <= end) + 1;
}
// <<< SANAD-BRANDS
