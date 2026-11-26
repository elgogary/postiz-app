'use client';
// >>> SANAD-BRANDS: the post's images large, one per row, each with its own comments; a comment written under a slide
// is pinned to that slide (prototype media dialog). Videos show with controls.
import { FC, useCallback, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Card, isVideo } from '@gitroom/helpers/brands/post.rules';
import { PostComment, dirOf, errorText, useBrandsApi } from './brands.api';
import { CommentList } from './brand.comments';

const Slides: FC<{ brandId: string; card: Card; canWrite: boolean; onChanged: () => void }> = ({ brandId, card, canWrite, onChanged }) => {
  const t = useT();
  const api = useBrandsApi();
  const { show } = useToaster();
  const [items, setItems] = useState<PostComment[]>([]);
  const [text, setText] = useState<Record<number, string>>({});
  const load = useCallback(() => api.comments(brandId, card.postId!).then(setItems).catch((e) => show(errorText(e, t), 'warning')), [api, brandId, card.postId]);
  useEffect(() => { load(); }, [load]);
  const send = async (n: number) => {
    try {
      await api.addComment(brandId, card.postId!, (text[n] || '').trim(), n);
      setText({ ...text, [n]: '' });
      show(`${t('comment_on_slide_sent', 'Comment on slide')} ${n} ${t('sent_lc', 'sent')}`, 'success');
      await load();
      onChanged();
    } catch (e) { show(errorText(e, t), 'warning'); }
  };
  return (
    <div className="flex flex-col gap-[24px] max-h-[75vh] overflow-y-auto min-w-[min(640px,calc(100vw_-_64px))]">
      {card.media.map((m, i) => {
        const n = i + 1;
        return (
          <figure key={i} className="flex flex-col gap-[8px]">
            {isVideo(m.path)
              ? <video src={m.path} controls className="w-full max-h-[480px] rounded-[8px] border border-fifth" />
              : <img src={m.path} alt={`${t('slide', 'Slide')} ${n}`} className="w-full max-w-[480px] aspect-[4/5] object-contain rounded-[8px] border border-fifth" />}
            <figcaption className="text-[12px] text-customColor18">{n} / {card.media.length}</figcaption>
            <CommentList items={items.filter((c) => c.slide === n)} />
            {canWrite && (
              <div className="flex gap-[8px] items-end">
                <textarea aria-label={`${t('comment_on_slide', 'Comment on slide')} ${n}`} placeholder={`${t('comment_on_slide', 'Comment on slide')} ${n}`}
                  dir={dirOf(text[n] || '')} className="flex-1 min-h-[44px] p-[8px] bg-input border border-fifth rounded-[6px] text-[13px]"
                  value={text[n] || ''} onChange={(e) => setText({ ...text, [n]: e.target.value })} />
                <button disabled={!(text[n] || '').trim()} className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] border border-fifth disabled:opacity-50" onClick={() => send(n)}>{t('send', 'Send')}</button>
              </div>
            )}
          </figure>
        );
      })}
    </div>
  );
};

export const useMediaDialog = () => {
  const modals = useModals();
  const t = useT();
  return useCallback((brandId: string, card: Card, canWrite: boolean, onChanged: () => void) => {
    if (!card.postId || !card.media.length) return;
    const title = card.format === 'Carousel' ? `${card.media.length} ${t('slides', 'slides')} · ${card.title}` : `${t('media', 'Media')} · ${card.title}`;
    modals.openModal({ title, closeOnClickOutside: true, closeOnEscape: true, children: () => <Slides brandId={brandId} card={card} canWrite={canWrite} onChanged={onChanged} /> });
  }, [modals, t]);
};
// <<< SANAD-BRANDS
