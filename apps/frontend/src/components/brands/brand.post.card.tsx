'use client';
// >>> SANAD-BRANDS: one post card (prototype postCard): top line, media, who and when, the two ticks, actions,
// new date and send-back forms, the brief, comments. Locks come from post.rules so the UI and the backend agree.
import { FC, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import type { BrandRole } from '@gitroom/helpers/brands/brand.rules';
import {
  Action, Card, MEDIA_HINT, STATE_LABEL, actionsFor, blockOf, datePassed, dueSoon, isVideo, mediaMissing,
} from '@gitroom/helpers/brands/post.rules';
import { dirOf, errorText, fmtWhen, useBrandsApi } from './brands.api';
import { BrandComments } from './brand.comments';
import { useMediaDialog } from './brand.media.dialog';
import { usePostEditor } from './post.editor';

const CHIP = 'text-[12px] px-[8px] py-[2px] rounded-[6px] border';
const STATE_CHIP: Record<string, string> = {
  review: 'border-[#612BD3]/30 bg-[#612BD3]/10 text-[#612BD3]', changes: 'border-[#e67700]/30 bg-[#e67700]/10 text-[#b35c00]',
  scheduled: 'border-[#2b8a3e]/30 bg-[#2b8a3e]/10 text-[#2b8a3e]', error: 'border-[#c92a2a]/30 bg-[#c92a2a]/10 text-[#c92a2a]',
};
const BTN = 'text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] disabled:opacity-50';
const PRIMARY = `${BTN} bg-[#612BD3] text-white`;
const QUIET = `${BTN} border border-fifth`;
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const BrandPostCard: FC<{
  brandId: string; card: Card; role: BrandRole; requiresApproval: boolean; checks: number;
  open: boolean; onToggle: () => void; onChanged: () => void; goChecks: () => void;
}> = ({ brandId, card: c, role, requiresApproval, checks, open, onToggle, onChanged, goChecks }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const editor = usePostEditor();
  const openMedia = useMediaDialog();
  const now = new Date();
  const [busy, setBusy] = useState(false);
  const [ticks, setTicks] = useState({ own: false, list: false });
  const [form, setForm] = useState<'' | 'date' | 'back'>('');
  const [date, setDate] = useState(() => toLocalInput(new Date(Date.now() + 86400000).toISOString()));
  const [reason, setReason] = useState('');
  const [thread, setThread] = useState(false);
  const actions = actionsFor(role, requiresApproval, c, now);
  const canWrite = role === 'create' || role === 'approve';
  const passed = datePassed(c, now);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); show(done, 'success'); setForm(''); onChanged(); } catch (e) { show(errorText(e, t), 'warning'); }
    setBusy(false);
  };
  const go: Record<Action, () => void> = {
    createDraft: () => run(() => api.createDraft(brandId, c.briefId!, c.date), t('draft_created', 'Draft created. Add the media in the editor.')),
    sendForReview: () => run(() => api.review(brandId, c.postId!), t('sent_for_review', 'Sent for review')),
    schedule: () => run(() => api.schedule(brandId, c.postId!), t('scheduled_for', 'Scheduled for') + ` ${fmtWhen(c.date)}`),
    approve: () => run(() => api.approve(brandId, c.postId!, ticks.own, ticks.list), t('approved_and_scheduled', 'Approved and scheduled for') + ` ${fmtWhen(c.date)}`),
    sendBack: () => setForm('back'),
    stop: () => run(() => api.stop(brandId, c.postId!), t('stopped_back_to_draft', 'Stopped: back to Draft')),
    newDate: () => setForm('date'),
    markPublished: () => run(() => api.published(brandId, c.postId!), t('marked_published', 'Marked published')),
  };
  const label: Record<Action, string> = {
    createDraft: t('create_draft', 'Create draft'), sendForReview: t('send_for_review', 'Send for review'),
    schedule: t('schedule', 'Schedule'), approve: t('approve', 'Approve'), sendBack: t('send_back', 'Send back'),
    stop: t('stop', 'Stop'), newDate: t('new_date', 'New date'), markPublished: t('mark_published', 'Mark published'),
  };
  const primary: Action[] = ['createDraft', 'sendForReview', 'schedule', 'approve'];
  const who = c.state === 'review' ? `${c.sentBy || ''} · ${t('sent_for_review_lc', 'sent for review')}`
    : c.state === 'changes' ? `${c.decidedBy || ''} · ${t('sent_back_lc', 'sent back')}`
    : c.state === 'scheduled' ? `${c.decidedBy || c.channel} · ${t('scheduled_lc', 'scheduled')}`
    : c.state === 'planned' ? t('in_plan_no_draft', 'In the plan, no draft yet') : c.channel;
  const images = c.media.filter((m) => !isVideo(m.path));
  const missing = mediaMissing(c.format, c.media) && c.state !== 'planned';

  return (
    <article id={`post-${c.key}`} className="bg-sixth border border-fifth rounded-[12px] p-[16px] flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-center gap-[8px] text-[13px]">
        <span className="font-[600]">{fmtWhen(c.date)}</span>
        <span className="text-customColor18">· {t(`format_${c.format.toLowerCase()}`, c.format)}</span>
        {c.goal && <span className={`${CHIP} border-fifth`}>{c.goal}</span>}
        <span className={`${CHIP} ${STATE_CHIP[c.state] || 'border-fifth'}`}>{t(`state_${c.state}`, STATE_LABEL[c.state])}</span>
        {passed && <span className={`${CHIP} border-[#c92a2a]/30 bg-[#c92a2a]/10 text-[#c92a2a]`}>{t('date_passed_pick', 'Date passed · pick a new date')}</span>}
        {dueSoon(c, now) && <span className={`${CHIP} border-[#c92a2a]/30 bg-[#c92a2a]/10 text-[#c92a2a]`}>{t('due_soon', 'due soon')}</span>}
        {c.firstDraft && ['draft', 'changes', 'review'].includes(c.state) && <span className={`${CHIP} border-[#e67700]/30 bg-[#e67700]/10 text-[#b35c00]`}>{t('first_draft_check', 'First draft · check it')}</span>}
      </div>
      <div>
        <h4 dir={dirOf(c.title)} className="text-[15px] font-[600]">{c.title}</h4>
        {c.sub && <p dir={dirOf(c.sub)} className="text-[13px] text-customColor18">{c.sub}</p>}
      </div>

      {missing ? (
        <div className="border border-dashed border-[#e67700] rounded-[8px] p-[12px] text-[13px] text-[#b35c00] flex flex-wrap items-center gap-[8px]">
          {t(`media_missing_${c.format.toLowerCase()}`, MEDIA_HINT[c.format] || 'Add the media first')}
          {canWrite && c.group && <button className={QUIET} onClick={() => editor.openExisting(c.group!, onChanged)}>{t('open_in_editor', 'Open in editor')}</button>}
        </div>
      ) : c.format === 'Poll' ? (
        <div className="border border-fifth rounded-[8px] p-[12px] text-[13px]">
          {c.slides.map((s, i) => <div key={i} dir={dirOf(s)} className={i === 0 ? 'font-[600] mb-[4px]' : ''}>{s}</div>)}
          <div className="text-customColor18 mt-[8px]">{t('poll_by_hand', 'Postiz cannot publish LinkedIn polls: post it by hand, then mark it published.')}</div>
        </div>
      ) : c.media.length > 0 ? (
        <button className="flex gap-[8px] items-start text-start" aria-label={t('open_media', 'Open the media')} onClick={() => openMedia(brandId, c, canWrite, onChanged)}>
          {images.slice(0, 4).map((m, i) => <img key={i} src={m.path} alt="" className="w-[96px] h-[120px] object-cover rounded-[6px] border border-fifth" />)}
          {images.length > 4 && <span className="w-[96px] h-[120px] rounded-[6px] border border-fifth flex items-center justify-center text-[13px]">+{images.length - 4}</span>}
          {c.media.some((m) => isVideo(m.path)) && <span className={`${CHIP} border-fifth`}>{t('video', 'Video')}</span>}
          {c.format === 'Carousel' && <span className="text-[12px] text-customColor18 self-end">{images.length} {t('slides_one_pdf', 'slides · one PDF on LinkedIn')}</span>}
        </button>
      ) : null}

      <div className="text-[12px] text-customColor18">{who}</div>
      {c.state === 'changes' && c.lastNote && (
        <div className="text-[13px] border border-fifth rounded-[8px] p-[8px]">
          <span className="font-[600]">{c.lastNote.by}</span>{c.lastNote.slide ? ` · ${t('slide', 'Slide')} ${c.lastNote.slide}` : ''}
          <div dir={dirOf(c.lastNote.text)}>{c.lastNote.text}</div>
        </div>
      )}

      {c.state === 'review' && role === 'approve' && (
        <fieldset className="border border-fifth rounded-[8px] p-[12px] flex flex-col gap-[8px] text-[13px]">
          <legend className="px-[4px] font-[600]">{t('before_you_approve', 'Before you approve')}</legend>
          {c.verify.trim() && (
            <label className="flex gap-[8px] items-start"><input type="checkbox" className="mt-[3px] w-[18px] h-[18px]" checked={ticks.own} onChange={(e) => setTicks({ ...ticks, own: e.target.checked })} />
              <span dir={dirOf(c.verify)}>{c.verify}</span></label>
          )}
          <label className="flex gap-[8px] items-center"><input type="checkbox" className="w-[18px] h-[18px]" checked={ticks.list} onChange={(e) => setTicks({ ...ticks, list: e.target.checked })} />
            <span>{t('list_checked', 'Before publishing list checked')} (<button className="underline" onClick={goChecks}>{checks} {t('checks', 'checks')}</button>)</span></label>
          <span id={`hint-${c.key}`} className="text-customColor18">{passed ? t('pick_date_then_tick', 'Pick a new date, then tick both to approve.') : t('tick_both', 'Tick both to approve.')}</span>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-[8px]">
        {actions.map((a) => {
          const block = blockOf(a, c, now, ticks);
          return (
            <button key={a} disabled={busy || block !== ''} aria-describedby={a === 'approve' ? `hint-${c.key}` : undefined}
              className={primary.includes(a) ? PRIMARY : QUIET} onClick={go[a]}>{label[a]}</button>
          );
        })}
        {actions.some((a) => blockOf(a, c, now) === 'media') && <span className="text-[12px] text-[#b35c00]">{t(`media_missing_${c.format.toLowerCase()}`, MEDIA_HINT[c.format] || '')}</span>}
        {canWrite && c.group && ['draft', 'changes'].includes(c.state) && !missing && <button className={QUIET} onClick={() => editor.openExisting(c.group!, onChanged)}>{t('open_in_editor', 'Open in editor')}</button>}
        {(c.caption || c.slides.length > 0) && <button className={QUIET} aria-expanded={open} onClick={onToggle}>{t('brief', 'Brief')}</button>}
        {c.postId && c.state !== 'published' && (
          <button className={`${QUIET} ms-auto`} aria-expanded={thread} onClick={() => setThread(!thread)}>
            {c.comments ? `${c.comments} ${t('comments', 'comments')}` : t('comment', 'Comment')}
          </button>
        )}
      </div>

      {form === 'date' && (
        <div className="flex flex-wrap items-end gap-[8px] border border-fifth rounded-[8px] p-[12px]">
          <label className="flex flex-col gap-[4px] text-[13px]">{t('new_date', 'New date')}
            <input type="datetime-local" className="h-[36px] px-[8px] bg-input border border-fifth rounded-[6px]" min={toLocalInput(new Date().toISOString())} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className={QUIET} onClick={() => setForm('')}>{t('cancel', 'Cancel')}</button>
          <button className={PRIMARY} disabled={busy || !date} onClick={() => run(() => {
            const iso = new Date(date).toISOString();
            return c.postId ? api.postDate(brandId, c.postId, iso) : api.briefDate(brandId, c.briefId!, iso);
          }, `${t('moved_to', 'Moved to')} ${fmtWhen(new Date(date).toISOString())}`)}>{t('save', 'Save')}</button>
        </div>
      )}
      {form === 'back' && (
        <div className="flex flex-col gap-[8px] border border-[#e67700]/40 bg-[#e67700]/5 rounded-[8px] p-[12px]">
          <label className="flex flex-col gap-[4px] text-[13px]">{t('what_should_change', 'What should change?')}
            <textarea autoFocus dir={dirOf(reason)} className="min-h-[72px] p-[8px] bg-input border border-fifth rounded-[6px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex gap-[8px] justify-end">
            <button className={QUIET} onClick={() => setForm('')}>{t('cancel', 'Cancel')}</button>
            <button className={PRIMARY} disabled={busy || !reason.trim()} onClick={() => run(() => api.sendBack(brandId, c.postId!, reason.trim()), t('sent_back_toast', 'Sent back'))}>{t('send_back', 'Send back')}</button>
          </div>
        </div>
      )}

      {open && (
        <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[16px] border-t border-fifth pt-[12px] text-[13px]">
          <div>
            <div className="font-[600] mb-[4px]">{t('caption', 'Caption')}</div>
            {c.caption.split('\n').map((l, i) => <p key={i} dir={dirOf(l)}>{l}</p>)}
          </div>
          <div className="flex flex-col gap-[12px]">
            {c.pillars.length > 0 && <div className="flex flex-wrap gap-[4px]">{c.pillars.map((p) => <span key={p} className={`${CHIP} border-fifth`}>{p}</span>)}</div>}
            {c.slides.length > 0 && c.format !== 'Poll' && (
              <div><div className="font-[600] mb-[4px]" dir={dirOf(c.slidesLabel)}>{c.slidesLabel || t('slides', 'Slides')}</div>
                <ol className="list-decimal ps-[20px]">{c.slides.map((s, i) => <li key={i} dir={dirOf(s)}>{s}</li>)}</ol></div>
            )}
            {c.visual && <div><div className="font-[600]">{t('visual_direction', 'Visual direction')}</div><p dir={dirOf(c.visual)}>{c.visual}</p></div>}
            {c.imagePrompt && <div><div className="font-[600]">{t('image_prompt', 'Image prompt')}</div><p dir="ltr" className="font-mono text-[12px]">{c.imagePrompt}</p></div>}
            {c.why && <div><div className="font-[600]">{t('why_the_ending', 'Why the ending')}</div><p dir={dirOf(c.why)}>{c.why}</p></div>}
            {c.verify && <div className="border border-[#e67700]/40 bg-[#e67700]/5 rounded-[8px] p-[8px]"><div className="font-[600]">{t('check_before_publishing', 'Check before publishing')}</div><p dir={dirOf(c.verify)}>{c.verify}</p></div>}
          </div>
        </div>
      )}
      {thread && c.postId && <BrandComments brandId={brandId} postId={c.postId} canWrite={canWrite} onChanged={onChanged} />}
    </article>
  );
};
// <<< SANAD-BRANDS
