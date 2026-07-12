'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import clsx from 'clsx';

interface Idea {
  id: string;
  idea: string;
  note?: string | null;
  source?: string | null;
  tags?: string[];
  createdAt: string;
}

const EditModal: FC<{
  idea: Idea;
  close: () => void;
  onSaved: () => void;
}> = ({ idea, close, onSaved }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [text, setText] = useState(idea.idea);
  const [tagsText, setTagsText] = useState((idea.tags || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);

  const refine = useCallback(async () => {
    if (!text.trim()) {
      return;
    }
    setRefining(true);
    try {
      const res = await (
        await fetch('/engagement/content-ideas/refine', {
          method: 'POST',
          body: JSON.stringify({ idea: text.trim() }),
        })
      ).json();
      if (res?.refined) {
        setText(res.refined);
        toaster.show(t('refined', 'Refined by AI'), 'success');
      }
    } catch (e) {
      toaster.show(t('refine_failed', 'Could not refine'), 'warning');
    }
    setRefining(false);
  }, [text, fetch, t, toaster]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const tags = tagsText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      await fetch(`/engagement/content-ideas/${idea.id}`, {
        method: 'PUT',
        body: JSON.stringify({ idea: text.trim(), tags }),
      });
      onSaved();
      close();
      toaster.show(t('saved', 'Saved'), 'success');
    } catch (e) {
      toaster.show(t('could_not_save', 'Could not save'), 'warning');
    }
    setBusy(false);
  }, [text, tagsText, idea.id, fetch, onSaved, close, t, toaster]);

  return (
    <div className="flex flex-col gap-[12px] min-w-[440px]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-[150px] bg-input border border-fifth rounded-[4px] p-[10px] text-[14px] outline-none"
      />
      <input
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        placeholder={t('tags_placeholder', 'Tags, comma separated')}
        className="bg-input border border-fifth rounded-[4px] p-[8px] text-[12px] outline-none"
      />
      <div className="flex gap-[8px] items-center">
        <Button secondary={true} onClick={refine} disabled={refining || busy}>
          {refining ? t('refining', 'Refining...') : t('refine_ai', 'Refine with AI')}
        </Button>
        <div className="flex-1" />
        <Button onClick={save} disabled={busy}>
          {t('save', 'Save')}
        </Button>
      </div>
    </div>
  );
};

export const IdeaBank: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const modals = useModals();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [text, setText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await (await fetch('/engagement/content-ideas')).json();
      if (Array.isArray(res)) {
        setIdeas(res);
      }
    } catch (e) {
      /* ignore */
    }
  }, [fetch]);

  useEffect(() => {
    load();
  }, [load]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    ideas.forEach((i) => (i.tags || []).forEach((tg) => s.add(tg)));
    return Array.from(s).sort();
  }, [ideas]);

  const shown = useMemo(
    () => (filter ? ideas.filter((i) => (i.tags || []).includes(filter)) : ideas),
    [ideas, filter]
  );

  const add = useCallback(async () => {
    if (!text.trim()) {
      toaster.show(t('type_an_idea', 'Type an idea'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const tags = tagsText
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      await fetch('/engagement/content-ideas', {
        method: 'POST',
        body: JSON.stringify({ idea: text.trim(), tags, source: 'ui' }),
      });
      setText('');
      setTagsText('');
      await load();
    } catch (e) {
      toaster.show(t('could_not_save', 'Could not save'), 'warning');
    }
    setBusy(false);
  }, [text, tagsText, fetch, load, t, toaster]);

  const remove = useCallback(
    async (id: string) => {
      if (await deleteDialog(t('delete_idea_confirm', 'Delete this idea?'))) {
        await fetch(`/engagement/content-ideas/${id}`, { method: 'DELETE' });
        await load();
      }
    },
    [fetch, load, t]
  );

  const edit = useCallback(
    (idea: Idea) => {
      modals.openModal({
        title: t('edit_idea', 'Edit idea'),
        closeOnClickOutside: true,
        closeOnEscape: true,
        children: (close: () => void) => (
          <EditModal idea={idea} close={close} onSaved={load} />
        ),
      });
    },
    [modals, load, t]
  );

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <div
      onClick={onClick}
      className={clsx(
        'cursor-pointer rounded-[4px] px-[10px] h-[26px] flex items-center text-[12px] border',
        active
          ? 'bg-[#612BD3] border-[#612BD3] text-white'
          : 'bg-newColColor border-newBgLineColor'
      )}
    >
      {label}
    </div>
  );

  return (
    <div className="flex flex-col gap-[16px] p-[16px]">
      <div className="flex flex-col gap-[4px]">
        <div className="text-[20px] font-[600]">
          {t('idea_bank', 'Idea Bank')}
        </div>
        <div className="text-[13px] text-customColor18 max-w-[640px]">
          {t(
            'idea_bank_desc',
            'Content ideas for your LinkedIn brand. Add, edit, or refine with AI. You can also tell Claude "add this to my idea bank" through the Postiz connector.'
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[8px]">
        <div className="flex gap-[8px] items-center">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                add();
              }
            }}
            placeholder={t('idea_placeholder', 'A post idea, angle, or hook...')}
            className="flex-1 bg-input border border-fifth rounded-[4px] p-[10px] text-[14px] outline-none"
          />
          <Button onClick={add} disabled={busy}>
            {t('add', 'Add')}
          </Button>
        </div>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder={t('tags_placeholder', 'Tags, comma separated (optional)')}
          className="bg-input border border-fifth rounded-[4px] p-[8px] text-[12px] outline-none"
        />
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-[6px] items-center">
          {chip(t('all', 'All'), filter === '', () => setFilter(''))}
          {allTags.map((tg) =>
            chip(tg, filter === tg, () => setFilter(filter === tg ? '' : tg))
          )}
        </div>
      )}

      <div className="text-[12px] text-customColor18">
        {shown.length} {t('ideas', 'ideas')}
        {filter ? ' - ' + filter : ''}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[12px]">
        {shown.map((i) => (
          <div
            key={i.id}
            className="bg-sixth border border-fifth rounded-[6px] p-[14px] flex flex-col gap-[8px]"
          >
            <div className="text-[14px] whitespace-pre-wrap flex-1">
              {i.idea}
            </div>
            {i.note && (
              <div className="text-[12px] text-customColor18">{i.note}</div>
            )}
            {i.tags && i.tags.length > 0 && (
              <div className="flex flex-wrap gap-[6px]">
                {i.tags.map((tg) => (
                  <div
                    key={tg}
                    onClick={() => setFilter(tg)}
                    className="cursor-pointer text-[11px] px-[8px] py-[2px] rounded-[4px] bg-forth text-white"
                  >
                    {tg}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-[12px] pt-[8px] mt-auto border-t border-fifth">
              <div className="text-[11px] text-customColor18 flex-1 truncate">
                {new Date(i.createdAt).toLocaleDateString()}
                {i.source ? ' - ' + i.source : ''}
              </div>
              <div
                onClick={() => edit(i)}
                className="text-[11px] text-[#0A66C2] cursor-pointer"
              >
                {t('edit', 'Edit')}
              </div>
              <div
                onClick={() => remove(i.id)}
                className="text-[11px] text-customColor18 cursor-pointer hover:text-red-400"
              >
                {t('delete', 'Delete')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="text-[13px] text-customColor18">
          {t(
            'no_ideas',
            'No ideas yet. Add one above, or tell Claude "add this to my idea bank".'
          )}
        </div>
      )}
    </div>
  );
};
