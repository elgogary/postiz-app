// >>> SANAD-BRANDS: ideas: topics and statuses, the old free-text idea split into fields, tags to brands, the AI
// first-draft prompt and its answer. Pure, shared by backend and frontend, tested without node_modules.
import { FORMATS, Format, textOf } from './post.rules';

export const TOPICS = [
  'Process & control design', 'Domain-modeling logic', 'Management & visibility logic', 'Financial & accounting logic',
  'Pricing & costing logic', 'Compliance & regulatory logic', 'AI', 'General',
] as const;
export type IdeaStatus = 'NEW' | 'PLANNED' | 'POSTED' | 'DROPPED';
export interface IdeaFields {
  hook: string; angle: string; bullets: string[]; brandIds: string[]; topic: string; pillars: string[];
  format: Format | ''; source: string;
}
export interface IdeaRow {
  id: string; idea: string; note: string | null; source: string | null; tags: string[]; createdAt: string;
  hook: string; angle: string; bullets: unknown; brandIds: string[]; topic: string; pillars: string[]; format: string;
  status: string; briefId: string | null;
}
export interface IdeaPlan { brandId: string; date: string; postId: string | null; postState: string | null }
export interface IdeaView extends IdeaFields {
  id: string; status: IdeaStatus; note: string; createdAt: string; briefId: string | null; tags: string[];
  plannedFor: { brandId: string; date: string; postId: string | null } | null;
}
export interface DraftInput { brand: string; voice: string; checks: string[]; idea: IdeaFields; format: Format }
export interface Draft { caption: string; slidesLabel: string; slides: string[] }

export const DRAFT_VERIFY = 'Check every number, name and example in this first draft, and make it sound like the brand before sending it for review.';

const BULLET = /^\s*(?:[-•*]|▪️?|\d+[.)])\s*/u;

const LABEL = /^[ \t]*(hook|angle|bullets)[ \t]*:[ \t]*(.*)$/i;

// Read line by line (a single regex over the whole text backtracks for minutes on long blank runs). The text is split
// when it opens with Hook:, then Angle:, then optionally Bullets:; a label seen a second time is plain text.
export const parseIdeaText = (text: string) => {
  const t = (text || '').replace(/\r\n?/g, '\n').trim();
  const parts: Record<string, string[]> = {};
  const seen: string[] = [];
  let at = '';
  for (const line of t.split('\n')) {
    const m = LABEL.exec(line);
    const key = m ? m[1].toLowerCase() : '';
    if (m && !parts[key]) { at = key; seen.push(key); parts[key] = [m[2]]; continue; }
    if (!at) break;
    parts[at].push(line);
  }
  if (seen[0] === 'hook' && seen[1] === 'angle' && (seen.length === 2 || seen[2] === 'bullets')) {
    const join = (k: string) => (parts[k] || []).join('\n').trim();
    const bullets = (parts.bullets || []).map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
    return { hook: join('hook'), angle: join('angle'), bullets, split: true };
  }
  const body = t.replace(/^[ \t]*hook[ \t]*:[ \t]*/i, '');
  const cut = body.search(/[.؟?!:](\s|$)/);
  const hook = (cut >= 0 ? body.slice(0, cut + 1) : body).slice(0, 160).trim();
  return { hook, angle: body.slice(hook.length).trim(), bullets: [] as string[], split: false };
};

export const composeIdeaText = (f: Pick<IdeaFields, 'hook' | 'angle' | 'bullets'>) =>
  `Hook: ${f.hook}\nAngle: ${f.angle}\nBullets:\n${f.bullets.map((b) => `- ${b}`).join('\n')}`.trimEnd();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');

export const mapTagsToBrands = (tags: string[], brands: { id: string; name: string }[], extra: Record<string, string> = {}) => {
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  for (const tag of tags) {
    const key = norm(tag);
    if (!key) continue;
    const mapped = Object.entries(extra).find(([k]) => norm(k) === key)?.[1];
    if (mapped && brands.some((b) => b.id === mapped)) { add(mapped); continue; }
    if (key.length < 3) continue;
    // A prefix counts only when it names one brand; two brands starting the same way need the sent map.
    const prefixed = brands.filter((b) => norm(b.name).startsWith(key));
    const hit = brands.find((b) => norm(b.name) === key) || (prefixed.length === 1 ? prefixed[0] : undefined);
    if (hit) add(hit.id);
  }
  return out;
};

export const topicFromTags = (tags: string[]) => {
  const topic = TOPICS.find((x) => tags.some((t) => norm(t) === norm(x)));
  if (topic) return topic;
  return tags.some((t) => ['ai', 'promptengineering'].includes(norm(t))) ? 'AI' : 'General';
};

const asFormat = (f: string): Format | '' => ((FORMATS as string[]).includes(f) ? (f as Format) : '');

export const ideaView = (r: IdeaRow, plan: IdeaPlan | null): IdeaView => {
  const old = parseIdeaText(r.idea);
  const bullets = Array.isArray(r.bullets) ? (r.bullets as unknown[]).filter((b): b is string => typeof b === 'string') : [];
  const status: IdeaStatus = r.status === 'DROPPED' ? 'DROPPED'
    : plan && plan.postState === 'PUBLISHED' ? 'POSTED'
    : r.status === 'PLANNED' ? 'PLANNED' : 'NEW';
  return {
    id: r.id, status, note: r.note || '', createdAt: r.createdAt, briefId: r.briefId, tags: r.tags || [],
    hook: r.hook || old.hook, angle: r.hook ? r.angle : old.angle, bullets: r.hook ? bullets : old.bullets,
    brandIds: r.brandIds || [], topic: r.topic || 'General', pillars: r.pillars || [], format: asFormat(r.format),
    source: r.source || '',
    plannedFor: plan ? { brandId: plan.brandId, date: plan.date, postId: plan.postId } : null,
  };
};

export const pillarsFor = (brandIds: string[], byBrand: Record<string, string[]>) => {
  const out: string[] = [];
  for (const id of brandIds) for (const p of byBrand[id] || []) if (!out.includes(p)) out.push(p);
  return out;
};

const SHAPE: Record<Format, string> = {
  Carousel: 'slides: 5 to 8 slide texts; the first is the cover, the last the takeaway. The caption introduces the carousel.',
  Video: 'slides: a short video script, one scene per item. The caption introduces the video.',
  Poll: 'slides: the poll question first, then 2 to 4 short options. The caption gives the context.',
  Image: 'slides: the points the image should show (may be empty). The caption carries the post.',
  Text: 'slides: the post\'s structure as short points (may be empty). The caption is the full post.',
};

export const draftPrompt = (input: DraftInput) => {
  const i = input.idea;
  const system = [
    `You write LinkedIn posts for the brand "${input.brand}". Follow the brand's voice rules exactly, and write in the language the voice rules use.`,
    'Answer with ONE JSON object and nothing else: {"caption": string, "slidesLabel": string, "slides": string[]}.',
    'Voice rules:', textOf(input.voice) || '(none written yet)',
    'Every post must pass these checks before publishing:', ...(input.checks.length ? input.checks.map((c) => `- ${c}`) : ['- (none written yet)']),
  ].join('\n');
  const user = [
    `Write a ${input.format} post from this idea.`, SHAPE[input.format],
    `Hook: ${i.hook}`, `Angle: ${i.angle}`, ...(i.bullets.length ? ['Points:', ...i.bullets.map((b) => `- ${b}`)] : []),
    ...(i.pillars.length ? [`Pillars: ${i.pillars.join(', ')}`] : []), `Topic: ${i.topic}`,
  ].join('\n');
  return { system, user };
};

export const parseDraft = (text: string): Draft | null => {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
    const caption = typeof v.caption === 'string' ? v.caption.trim().slice(0, 3000) : '';
    if (!caption) return null;
    const slides = Array.isArray(v.slides)
      ? v.slides.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 12)
      : [];
    return { caption, slidesLabel: typeof v.slidesLabel === 'string' ? v.slidesLabel.trim().slice(0, 80) : '', slides };
  } catch {
    return null;
  }
};
// <<< SANAD-BRANDS
