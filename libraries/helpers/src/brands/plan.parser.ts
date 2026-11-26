// >>> SANAD-BRANDS: reads an uploaded content-plan HTML as DATA. Its <script> is never executed: the GOALS, WEEKS
// and P constants are parsed as literals, and anything that is not a literal (a call, a function) is refused.
export interface PlanPost {
  n: number; date: string; week: number; fmt: string; goal: string; pillar: string; pillars: string[];
  title: string; sub: string; sl: string; slides: string[]; cap: string; cta: string; vis: string; prompt: string; verify: string;
}
export interface ParsedPlan {
  sections: Record<'summary' | 'voice' | 'routine' | 'profile', string>;
  rows: Record<'pillars' | 'bench' | 'kpi' | 'review' | 'history' | 'focus', string[][]>;
  notes: Record<string, string>;
  posts: PlanPost[];
  goals: Record<string, string>;
}

const PILLARS = ['AI', 'Digital Transformation', 'Process Engineering'];
const AR_MONTHS: Record<string, number> = { يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, مايو: 5, يونيو: 6, يوليو: 7,
  أغسطس: 8, سبتمبر: 9, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
const AGO_MONTHS: Record<string, number> = { يومين: 0, شهرين: 2, '3 شهور': 3, '4 شهور': 4 };
const KEEP = new Set(['p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'br', 'h3', 'h4']);
const KICKER = /^(\d{2}\s*[—·-]\s*\S.*|[A-Z][A-Z &/+.—-]{3,})$/;

const unescapeHtml = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

// literal reader: quotes bare keys, turns '...' "..." `...` into JSON strings, refuses calls and code
function literalToJson(src: string): string {
  if (/\bfunction\b|=>|\(|\$\{/.test(src.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, '""'))) {
    throw new Error('Not plan data: the script holds code, not a list');
  }
  let out = '';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, text = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] !== '\\') { text += src[j]; j += 1; continue; }
        const e = src[j + 1];
        const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '/': '/', '\\': '\\', '"': '"', "'": "'", '`': '`' };
        if (e in simple) { text += simple[e]; j += 2; }
        else if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(src.slice(j + 2, j + 4))) { text += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)); j += 4; }
        else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) { text += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; }
        else throw new Error('Not plan data: a string holds an escape that is not plain text');
      }
      if (j >= src.length) throw new Error('Not plan data: a string is not closed');
      out += JSON.stringify(text);
      i = j + 1;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (word) {
      out += src.slice(i + word[0].length).trimStart().startsWith(':') ? JSON.stringify(word[0]) : word[0];
      i += word[0].length;
      continue;
    }
    out += c; i += 1;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readConst(script: string, name: string): unknown {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*`).exec(script);
  if (!m) throw new Error(`Not plan data: ${name} is missing`);
  const start = m.index + m[0].length, open = script[start], close = open === '[' ? ']' : '}';
  let depth = 0, q = '';
  for (let i = start; i < script.length; i += 1) {
    const ch = script[i];
    if (q) { if (ch === '\\') { i += 1; } else if (ch === q) { q = ''; } continue; }
    if (ch === '"' || ch === "'" || ch === '`') q = ch;
    else if (ch === open) depth += 1;
    else if (ch === close && --depth === 0) {
      const json = literalToJson(script.slice(start, i + 1));
      try { return JSON.parse(json); } catch { throw new Error(`Not plan data: ${name} is not a plain list`); }
    }
  }
  throw new Error(`Not plan data: ${name} is not closed`);
}

function simplify(fragment: string): string {
  let f = fragment.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  f = f.replace(/<\/?(div|section|article|header|aside|span|a|blockquote|h1|h2)\b[^>]*>/gi, '\n');
  f = f.replace(/<(\w+)\b[^>]*?(\/?)>/g, (m, t: string, sl: string) => (KEEP.has(t.toLowerCase()) ? `<${t.toLowerCase()}${sl}>` : ''));
  f = f.replace(/<\/(\w+)>/g, (m, t: string) => (KEEP.has(t.toLowerCase()) ? `</${t.toLowerCase()}>` : ''));
  const out: string[] = [];
  let inBlock = 0;
  for (const raw of f.split('\n')) {
    const ln = raw.trim();
    if (!ln) continue;
    const plain = unescapeHtml(ln.replace(/<[^>]+>/g, '')).trim();
    if (plain && KICKER.test(plain)) continue;
    const opens = (ln.match(/<(ul|ol|table)>/g) || []).length, closes = (ln.match(/<\/(ul|ol|table)>/g) || []).length;
    if (inBlock || opens || /^<(p|li|tr|td|th|thead|tbody|h3|h4)>/.test(ln) || ln.startsWith('</')) out.push(ln);
    else if (plain) out.push(`<p>${ln}</p>`);
    inBlock += opens - closes;
  }
  return out.join('\n').replace(/ — /g, ' · ').replace(/—/g, '·').replace(/<p>\s*<\/p>/g, '');
}

const cellText = (cell: string) => unescapeHtml(cell.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
const tableRows = (frag: string) => [...frag.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1])
  .filter((tr) => !tr.includes('<th>')).map((tr) => [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => cellText(m[1])));
const firstNote = (frag: string) => {
  const paras = [...frag.split('<table>')[0].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => cellText(m[1]));
  return paras.length > 1 ? paras[1] : '';
};

function sectionHtml(page: string, id: string, ids: string[]): string {
  const m = new RegExp(`id="${id}"`).exec(page);
  if (!m) return '';
  const after = m.index + m[0].length;
  const ends = ids.filter((x) => x !== id).map((x) => page.indexOf(`id="${x}"`, after)).filter((x) => x > after)
    .map((x) => page.lastIndexOf('<', x)).filter((x) => x > after);
  const scriptAt = page.indexOf('<script', after);
  const end = Math.min(...ends, scriptAt > after ? scriptAt : page.length);
  return simplify(page.slice(after, end).split('>').slice(1).join('>'));
}

function weekDates(range: string, year = 2026): [string, string] {
  const [a, b = ''] = range.split(/[–-]/).map((x) => x.trim());
  const [endDay, endMonthName] = b.split(/\s+/);
  const startBits = a.split(/\s+/);
  const endMonth = AR_MONTHS[endMonthName], startMonth = startBits[1] ? AR_MONTHS[startBits[1]] : endMonth;
  if (!endMonth || !startMonth) throw new Error('Not plan data: a week range has a month that is not recognised');
  const pad = (n: number) => String(n).padStart(2, '0');
  return [`${year}-${pad(startMonth)}-${pad(Number(startBits[0]))}`, `${year}-${pad(endMonth)}-${pad(Number(endDay))}`];
}

function agoToMonth(when: string, start: [number, number] = [2026, 11]): string {
  if (!(when in AGO_MONTHS)) return '';
  let [y, m] = start;
  m -= AGO_MONTHS[when];
  while (m < 1) { y -= 1; m += 12; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function benchRow(r: string[]): string[] {
  const [name, ...restLines] = (r[0] || '').split('\n');
  const rest = restLines.join(' ');
  const followers = /حوالي\s*([\d.]+)K/.exec(rest);
  const title = rest.replace(/\s*·\s*حوالي.*$/, '').trim();
  return [[name, title].filter(Boolean).join('\n'), '', followers ? String(Math.round(Number(followers[1]) * 1000)) : '', '',
    r[1] || '', r[2] || '', r[3] || ''];
}

export function parsePlan(page: string): ParsedPlan {
  const script = (/<script[^>]*>([\s\S]*?)<\/script>/.exec(page) || [])[1] || '';
  const goals = readConst(script, 'GOALS') as Record<string, string>;
  const weeks = readConst(script, 'WEEKS') as { n: number; range: string; title: string; desc: string }[];
  const raw = readConst(script, 'P') as Omit<PlanPost, 'pillars'>[];
  const ids = [...page.matchAll(/id="([a-z]+)"/g)].map((m) => m[1]);
  const tab = (id: string) => sectionHtml(page, id, ids);
  const review = tab('review');
  const [checks, rules] = review.includes('</ol>') ? [review.split('</ol>')[0], review.split('</ol>').slice(1).join('</ol>')] : [review, ''];
  const bench = tab('bench'), kpi = tab('kpi'), history = tab('history');
  return {
    sections: { summary: tab('overview'), voice: tab('voice') + rules.trim(), routine: tab('routine'), profile: tab('profile') },
    rows: {
      pillars: PILLARS.map((p) => [p]),
      bench: tableRows(bench).map(benchRow),
      kpi: tableRows(kpi),
      review: [...checks.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => [cellText(m[1])]),
      history: tableRows(history).map(([when, idea]) => [agoToMonth(when), when === 'منافسين' ? 'competitor' : 'ours', idea]),
      focus: weeks.map((w) => [...weekDates(w.range), w.title, w.desc]),
    },
    notes: { bench: firstNote(bench), kpi: firstNote(kpi),
      history: 'Months worked out from the plan\'s own "2 days / 2, 3, 4 months ago", counted back from the plan start.' },
    posts: raw.map((p) => ({ ...p, pillars: p.pillar.includes('·') ? PILLARS : [p.pillar] })),
    goals,
  };
}
// <<< SANAD-BRANDS
