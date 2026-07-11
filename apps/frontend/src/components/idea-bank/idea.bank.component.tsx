"use client";

import { FC, useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';

interface Idea {
  id: string;
  idea: string;
  note?: string | null;
  source?: string | null;
  createdAt: string;
}

export const IdeaBank: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [text, setText] = useState('');
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

  const add = useCallback(async () => {
    if (!text.trim()) {
      toaster.show(t('type_an_idea', 'Type an idea'), 'warning');
      return;
    }
    setBusy(true);
    try {
      await fetch('/engagement/content-ideas', {
        method: 'POST',
        body: JSON.stringify({ idea: text.trim(), source: 'ui' }),
      });
      setText('');
      await load();
      toaster.show(t('idea_saved', 'Idea saved'), 'success');
    } catch (e) {
      toaster.show(t('could_not_save', 'Could not save'), 'warning');
    }
    setBusy(false);
  }, [text, fetch, load, t, toaster]);

  const remove = useCallback(
    async (id: string) => {
      if (await deleteDialog(t('delete_idea_confirm', 'Delete this idea?'))) {
        await fetch(`/engagement/content-ideas/${id}`, { method: 'DELETE' });
        await load();
      }
    },
    [fetch, load, t]
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
            'Content ideas for your LinkedIn brand. Add them here, or tell Claude "add this to my idea bank" through the Postiz connector.'
          )}
        </div>
      </div>

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

      <div className="text-[12px] text-customColor18">
        {ideas.length} {t('ideas', 'ideas')}
      </div>

      <div className="flex flex-col gap-[8px]">
        {ideas.map((i) => (
          <div
            key={i.id}
            className="bg-sixth border border-fifth rounded-[4px] p-[12px] flex items-start gap-[10px]"
          >
            <div className="flex-1 flex flex-col gap-[4px]">
              <div className="text-[14px] whitespace-pre-wrap">{i.idea}</div>
              {i.note && (
                <div className="text-[12px] text-customColor18">{i.note}</div>
              )}
              <div className="text-[11px] text-customColor18">
                {new Date(i.createdAt).toLocaleDateString()}
                {i.source ? ' - ' + i.source : ''}
              </div>
            </div>
            <div
              onClick={() => remove(i.id)}
              className="text-[11px] text-customColor18 cursor-pointer hover:text-red-400"
            >
              {t('delete', 'Delete')}
            </div>
          </div>
        ))}
        {ideas.length === 0 && (
          <div className="text-[13px] text-customColor18">
            {t(
              'no_ideas',
              'No ideas yet. Add one above, or tell Claude "add this to my idea bank".'
            )}
          </div>
        )}
      </div>
    </div>
  );
};
