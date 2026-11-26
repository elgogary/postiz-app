// >>> SANAD-BRANDS: builds the full list of section writes from a parsed plan. Pure: nothing is saved here, so the
// dry run and the real run check exactly the same data.
// A section with nothing parsed is skipped, so an import never writes an empty list over existing content. Any error from cleanHtml/validateRows propagates.
import { cleanHtml, validateRows } from './brand.rules';
import type { ParsedPlan } from './plan.parser';
import { briefsFromPlan, BriefWrite } from './post.rules';

export interface SectionWrite {
  key: string;
  content?: string;
  rows?: string[][];
  note?: string | null;
}

export function prepareImport(plan: ParsedPlan, tzOffset = 0): {
  writes: SectionWrite[];
  briefs: BriefWrite[];
  summary: { sections: string[]; rows: Record<string, number>; posts: number };
} {
  const writes: SectionWrite[] = [];
  for (const [key, html] of Object.entries(plan.sections)) {
    if (html.trim()) writes.push({ key, content: cleanHtml(html) });
  }
  for (const [key, rows] of Object.entries(plan.rows)) {
    const clean = validateRows(key, rows);
    if (clean.length) writes.push({ key, rows: clean, note: plan.notes[key] || null });
  }
  const briefs = briefsFromPlan(plan.posts, plan.goals, tzOffset);
  return {
    writes,
    briefs,
    summary: {
      sections: writes.filter((w) => w.content !== undefined).map((w) => w.key),
      rows: Object.fromEntries(writes.filter((w) => w.rows !== undefined).map((w) => [w.key, w.rows!.length])),
      posts: briefs.length,
    },
  };
}
// <<< SANAD-BRANDS
