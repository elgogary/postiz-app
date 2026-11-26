// >>> SANAD-BRANDS: builds the full list of section writes from a parsed plan. Pure: nothing is saved here, so the
// dry run and the real run check exactly the same data. Any error from cleanHtml/validateRows propagates.
import { cleanHtml, validateRows } from './brand.rules';
import type { ParsedPlan } from './plan.parser';

export interface SectionWrite {
  key: string;
  content?: string;
  rows?: string[][];
  note?: string | null;
}

export function prepareImport(plan: ParsedPlan): {
  writes: SectionWrite[];
  summary: { sections: string[]; rows: Record<string, number>; posts: number };
} {
  const writes: SectionWrite[] = [];
  for (const [key, html] of Object.entries(plan.sections)) {
    if (html.trim()) writes.push({ key, content: cleanHtml(html) });
  }
  for (const [key, rows] of Object.entries(plan.rows)) {
    writes.push({ key, rows: validateRows(key, rows), note: plan.notes[key] || null });
  }
  return {
    writes,
    summary: {
      sections: writes.filter((w) => w.content !== undefined).map((w) => w.key),
      rows: Object.fromEntries(writes.filter((w) => w.rows !== undefined).map((w) => [w.key, w.rows!.length])),
      posts: plan.posts.length,
    },
  };
}
// <<< SANAD-BRANDS
