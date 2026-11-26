'use client';
// >>> SANAD-BRANDS: a post's comments, newest last; a comment pinned to a slide shows "Slide N".
import { FC, useCallback, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { PostComment, dirOf, errorText, useBrandsApi } from './brands.api';

export const CommentList: FC<{ items: PostComment[] }> = ({ items }) => {
  const t = useT();
  return (
    <ul className="flex flex-col gap-[8px]">
      {items.map((c) => (
        <li key={c.id} className="text-[13px]">
          <span className="font-[600]">{c.by}</span>
          <span className="text-customColor18"> · {new Date(c.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          {c.slide ? <span className="ms-[8px] text-[12px] px-[6px] rounded-[6px] border border-fifth">{t('slide_n', 'Slide {n}').replace('{n}', String(c.slide))}</span> : null}
          <div dir={dirOf(c.text)}>{c.text}</div>
        </li>
      ))}
    </ul>
  );
};

export const BrandComments: FC<{ brandId: string; postId: string; canWrite: boolean; onChanged: () => void }> = ({ brandId, postId, canWrite, onChanged }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const [items, setItems] = useState<PostComment[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // A failed load shows an empty thread, not "Loading" forever.
  const load = useCallback(() => api.comments(brandId, postId).then(setItems).catch((e) => { setItems((v) => v ?? []); show(errorText(e, t), 'warning'); }), [api, brandId, postId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    setSending(true);
    try { await api.addComment(brandId, postId, text.trim()); setText(''); show(t('comment_sent', 'Comment sent'), 'success'); await load(); onChanged(); }
    catch (e) { show(errorText(e, t), 'warning'); }
    setSending(false);
  };
  return (
    <div className="flex flex-col gap-[8px] border-t border-fifth pt-[12px]">
      {items === null ? <div className="text-customColor18 text-[13px]">{t('loading', 'Loading…')}</div> : <CommentList items={items} />}
      {canWrite && (
        <div className="flex gap-[8px] items-end">
          <textarea aria-label={t('write_a_comment', 'Write a comment')} placeholder={t('write_a_comment', 'Write a comment')} dir={dirOf(text)}
            className="flex-1 min-h-[44px] p-[8px] bg-input border border-fifth rounded-[6px] text-[13px]" value={text} onChange={(e) => setText(e.target.value)} />
          <button disabled={sending || !text.trim()} className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth disabled:opacity-50" onClick={send}>{t('send', 'Send')}</button>
        </div>
      )}
    </div>
  );
};
// <<< SANAD-BRANDS
