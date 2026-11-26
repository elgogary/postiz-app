// >>> SANAD-BRANDS: post states, review actions and locks, Where it stands, mix, calendar and plan-to-brief rules.
// Pure, so the backend and the frontend share one rule and it is tested without node_modules.
import type { BrandRole } from './brand.rules';
import type { PlanPost } from './plan.parser';

export type ReviewState = 'NONE' | 'IN_REVIEW' | 'SENT_BACK' | 'APPROVED';
export type PostizState = 'QUEUE' | 'PUBLISHED' | 'ERROR' | 'DRAFT';
export type CardState = 'planned' | 'draft' | 'review' | 'changes' | 'scheduled' | 'published' | 'error';
export type Format = 'Text' | 'Carousel' | 'Image' | 'Video' | 'Poll';
export type Action = 'createDraft' | 'sendForReview' | 'schedule' | 'approve' | 'sendBack' | 'stop' | 'newDate' | 'markPublished';
export type Block = '' | 'media' | 'date' | 'ticks';

export const FORMATS: Format[] = ['Text', 'Carousel', 'Image', 'Video', 'Poll'];
export const STATE_ORDER: CardState[] = ['review', 'changes', 'draft', 'planned', 'scheduled', 'published', 'error'];
export const STATE_LABEL: Record<CardState, string> = {
  planned: 'Planned', draft: 'Draft', review: 'In review', changes: 'Sent back', scheduled: 'Scheduled',
  published: 'Published', error: 'Failed',
};
export const MEDIA_HINT: Partial<Record<Format, string>> = {
  Carousel: 'Add the carousel slides first', Video: 'Add the video first', Image: 'Add the image first',
};
const HOUR = 3600000;

export interface MediaItem { path: string }
export interface Note { by: string; text: string; slide: number | null }
export interface Card {
  key: string; briefId: string | null; postId: string | null; group: string | null;
  date: string; state: CardState; format: Format; goal: string; pillars: string[];
  title: string; sub: string; caption: string; slidesLabel: string; slides: string[];
  visual: string; imagePrompt: string; why: string; verify: string; firstDraft: boolean;
  media: MediaItem[]; channel: string; sentBy: string | null; decidedBy: string | null; comments: number;
  lastNote: Note | null;
}
export interface BriefRow {
  id: string; postId: string | null; plannedAt: string; format: Format; goal: string; pillars: string[];
  title: string; sub: string; caption: string; slidesLabel: string; slides: string[]; visual: string;
  imagePrompt: string; why: string; verify: string; firstDraft: boolean; review: ReviewState;
  sentById: string | null; decidedById: string | null;
}
export interface PostRow {
  id: string; group: string; publishDate: string; state: PostizState; content: string; image: MediaItem[];
  channel: string; comments: number; lastNote: Note | null;
}
export interface BriefWrite {
  planRef: string; plannedAt: string; format: Format; goal: string; pillars: string[]; title: string; sub: string;
  caption: string; slidesLabel: string; slides: string[]; visual: string; imagePrompt: string; why: string; verify: string;
}

export const stateOf = (hasPost: boolean, postState: PostizState | null, review: ReviewState): CardState => {
  if (!hasPost) return 'planned';
  if (postState === 'PUBLISHED') return 'published';
  if (postState === 'ERROR') return 'error';
  if (postState === 'QUEUE') return 'scheduled';
  if (review === 'IN_REVIEW') return 'review';
  if (review === 'SENT_BACK') return 'changes';
  return 'draft';
};

export const isVideo = (path: string) => /\.mp4($|\?)/i.test(path);

export const inferFormat = (media: MediaItem[]): Format => {
  if (media.some((m) => isVideo(m.path))) return 'Video';
  if (media.length >= 2) return 'Carousel';
  return media.length === 1 ? 'Image' : 'Text';
};

export const mediaMissing = (format: Format, media: MediaItem[]) => {
  const videos = media.filter((m) => isVideo(m.path)).length;
  const images = media.length - videos;
  if (format === 'Carousel') return images < 2 || videos > 0;
  if (format === 'Video') return videos < 1;
  if (format === 'Image') return images < 1;
  return false;
};

const open = (s: CardState) => s === 'planned' || s === 'draft' || s === 'review' || s === 'changes';
export const datePassed = (c: Pick<Card, 'state' | 'date'>, now: Date) => open(c.state) && Date.parse(c.date) < now.getTime();
export const dueSoon = (c: Pick<Card, 'state' | 'date'>, now: Date) => {
  const left = Date.parse(c.date) - now.getTime();
  return c.state === 'review' && left >= 0 && left < 36 * HOUR;
};

export const actionsFor = (role: BrandRole, requiresApproval: boolean, c: Card, now: Date): Action[] => {
  const create = role === 'create' || role === 'approve';
  const approve = role === 'approve';
  const out: Action[] = [];
  if (create && datePassed(c, now)) out.push('newDate');
  if (c.state === 'planned' && create) out.push('createDraft');
  if ((c.state === 'draft' || c.state === 'changes') && create) out.push(requiresApproval ? 'sendForReview' : 'schedule');
  if (c.state === 'review' && approve) out.push('approve', 'sendBack');
  if ((c.state === 'review' || c.state === 'scheduled') && approve) out.push('stop');
  if (c.format === 'Poll' && approve && (c.state === 'draft' || c.state === 'review' || c.state === 'scheduled')) out.push('markPublished');
  return out;
};

// Why an allowed action cannot run yet ('' = it can). The backend refuses with the same rule.
export const blockOf = (action: Action, c: Card, now: Date, ticks = { own: false, list: false }): Block => {
  if ((action === 'sendForReview' || action === 'schedule') && mediaMissing(c.format, c.media)) return 'media';
  if ((action === 'approve' || action === 'schedule') && datePassed(c, now)) return 'date';
  if (action === 'approve' && !((ticks.own || !c.verify.trim()) && ticks.list)) return 'ticks';
  return '';
};

export const textOf = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

export function buildCards(briefs: BriefRow[], posts: PostRow[], names: Record<string, string>): Card[] {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const linked = new Set(briefs.map((b) => b.postId).filter((x): x is string => !!x));
  const name = (id: string | null) => (id ? names[id] || null : null);
  const cards: Card[] = briefs.map((b) => {
    const p = b.postId ? byId.get(b.postId) : undefined;
    return {
      key: `b:${b.id}`, briefId: b.id, postId: p?.id || null, group: p?.group || null,
      date: p?.publishDate || b.plannedAt, state: stateOf(!!p, p?.state || null, b.review), format: b.format,
      goal: b.goal, pillars: b.pillars, title: b.title, sub: b.sub, caption: b.caption || (p ? textOf(p.content) : ''),
      slidesLabel: b.slidesLabel, slides: b.slides, visual: b.visual, imagePrompt: b.imagePrompt, why: b.why,
      verify: b.verify, firstDraft: b.firstDraft, media: p?.image || [], channel: p?.channel || '',
      sentBy: name(b.sentById), decidedBy: name(b.decidedById), comments: p?.comments || 0, lastNote: p?.lastNote || null,
    };
  });
  for (const p of posts) {
    if (linked.has(p.id)) continue;
    const text = textOf(p.content);
    cards.push({
      key: `p:${p.id}`, briefId: null, postId: p.id, group: p.group, date: p.publishDate,
      state: stateOf(true, p.state, 'NONE'), format: inferFormat(p.image), goal: '', pillars: [],
      title: text.split('\n')[0].slice(0, 80), sub: '', caption: text, slidesLabel: '', slides: [], visual: '',
      imagePrompt: '', why: '', verify: '', firstDraft: false, media: p.image, channel: p.channel,
      sentBy: null, decidedBy: null, comments: p.comments, lastNote: p.lastNote,
    });
  }
  return cards.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || Date.parse(a.date) - Date.parse(b.date));
}

export interface Stands {
  total: number; published: number; scheduled: number; review: number; changes: number; draft: number; planned: number;
  nextScheduled: string | null; reviewDatePassed: number; reviewDueSoon: number; changesDatePassed: number;
  draftsMissingMedia: number; draftsDatePassed: number; plannedDatePassed: number; waitingOn: string[];
}

export const whereItStands = (cards: Card[], now: Date): Stands => {
  const of = (s: CardState) => cards.filter((c) => c.state === s);
  const passed = (s: CardState) => of(s).filter((c) => datePassed(c, now)).length;
  const upcoming = of('scheduled').map((c) => c.date).filter((d) => Date.parse(d) >= now.getTime());
  return {
    total: cards.length, published: of('published').length, scheduled: of('scheduled').length,
    review: of('review').length, changes: of('changes').length, draft: of('draft').length, planned: of('planned').length,
    nextScheduled: upcoming.sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null,
    reviewDatePassed: passed('review'), reviewDueSoon: of('review').filter((c) => dueSoon(c, now)).length,
    changesDatePassed: passed('changes'),
    draftsMissingMedia: cards.filter((c) => (c.state === 'draft' || c.state === 'changes') && mediaMissing(c.format, c.media)).length,
    draftsDatePassed: passed('draft'), plannedDatePassed: passed('planned'),
    waitingOn: [...new Set(of('changes').map((c) => c.sentBy).filter((n): n is string => !!n))],
  };
};

const tally = (values: string[]): [string, number][] =>
  [...values.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export const contentMix = (cards: Card[]) => ({
  byGoal: tally(cards.map((c) => c.goal).filter(Boolean)),
  byFormat: tally(cards.map((c) => c.format)),
  byPillar: tally(cards.flatMap((c) => c.pillars)),
});

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const planWindow = (focusRows: string[][] | null | undefined, today: Date) => {
  const starts = (focusRows || []).map((r) => r[0]).filter(Boolean).sort();
  const ends = (focusRows || []).map((r) => r[1]).filter(Boolean).sort();
  if (starts.length && ends.length) return { from: starts[0], to: ends[ends.length - 1] };
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  return { from: isoDay(new Date(Date.UTC(y, m, 1))), to: isoDay(new Date(Date.UTC(y, m + 1, 0))) };
};

// Whole weeks, Sunday to Saturday, covering from..to.
export const calendarWeeks = (from: string, to: string): string[][] => {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const weeks: string[][] = [];
  while (d <= end) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) { week.push(isoDay(d)); d.setUTCDate(d.getUTCDate() + 1); }
    weeks.push(week);
  }
  return weeks;
};

// tzOffset is the browser's Date.getTimezoneOffset(): minutes of UTC minus local (Cairo in winter = -120).
export const localToUtc = (day: string, time: string, tzOffset: number) =>
  new Date(Date.parse(`${day}T${time}:00Z`) + tzOffset * 60000).toISOString();
export const localDay = (iso: string, tzOffset: number) => isoDay(new Date(Date.parse(iso) - tzOffset * 60000));

const asFormat = (f: string): Format => ((FORMATS as string[]).includes(f) ? (f as Format) : 'Text');

export const briefsFromPlan = (posts: PlanPost[], goals: Record<string, string>, tzOffset: number): BriefWrite[] => {
  const first = posts.map((p) => p.date).sort()[0] || '';
  return posts.map((p) => ({
    planRef: `${first}#${p.n}`, plannedAt: localToUtc(p.date, '09:30', tzOffset), format: asFormat(p.fmt),
    goal: goals[p.goal] || p.goal || '', pillars: p.pillars, title: p.title, sub: p.sub, caption: p.cap,
    slidesLabel: p.sl, slides: p.slides, visual: p.vis, imagePrompt: p.prompt, why: p.cta, verify: p.verify,
  }));
};

// A brief links to an existing post only when its local day holds exactly one brief and exactly one free post.
export const matchPosts = (briefs: { planRef: string; plannedAt: string }[], posts: { id: string; publishDate: string }[],
  taken: Set<string>, tzOffset: number): Record<string, string> => {
  const day = (iso: string) => localDay(iso, tzOffset);
  const out: Record<string, string> = {};
  for (const b of briefs) {
    const d = day(b.plannedAt);
    const sameBriefs = briefs.filter((x) => day(x.plannedAt) === d).length;
    const free = posts.filter((p) => !taken.has(p.id) && day(p.publishDate) === d);
    if (sameBriefs === 1 && free.length === 1) out[b.planRef] = free[0].id;
  }
  return out;
};

// The name of the first brand among these channels whose posts need approval (no settings row = needs approval).
export const approvalBlock = (channels: { customerId: string; name: string }[],
  settings: { customerId: string; requiresApproval: boolean }[]): string | null => {
  const off = new Set(settings.filter((s) => !s.requiresApproval).map((s) => s.customerId));
  return channels.find((c) => !off.has(c.customerId))?.name ?? null;
};
// <<< SANAD-BRANDS
