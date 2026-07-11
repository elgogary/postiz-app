'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { FormProvider, useForm } from 'react-hook-form';
import { object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

type Tab = 'queue' | 'targets' | 'health';

export const Engagement: FC = () => {
  const t = useT();
  const [tab, setTab] = useState<Tab>('queue');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'queue', label: t('review_queue', 'Review queue') },
    { key: 'targets', label: t('targets', 'Targets') },
    { key: 'health', label: t('account_health', 'Account health') },
  ];
  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('engagement', 'Engagement')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'engagement_help',
          'Comment on the right people in your voice — rewrite every draft before you post it.'
        )}
      </div>
      <div className="flex gap-[8px] mt-[16px] border-b border-fifth">
        {tabs.map((x) => (
          <div
            key={x.key}
            onClick={() => setTab(x.key)}
            className={clsx(
              'cursor-pointer px-[14px] py-[8px] text-[14px] -mb-[1px] border-b-2',
              tab === x.key
                ? 'border-forth text-textColor'
                : 'border-transparent text-customColor18'
            )}
          >
            {x.label}
          </div>
        ))}
      </div>
      <div className="mt-[16px]">
        {tab === 'queue' && <QueueTab />}
        {tab === 'targets' && <TargetsTab />}
        {tab === 'health' && <HealthTab />}
      </div>
    </div>
  );
};

/* ---------------- Review queue ---------------- */
const QueueTab: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const list = useCallback(async () => {
    return (await fetch('/engagement/queue')).json();
  }, []);
  const { data, mutate } = useSWR('engagement-queue', list);
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="bg-sixth border border-fifth rounded-[4px] p-[12px] text-[12px] text-customColor18">
        {t(
          'engagement_rewrite_note',
          'Rewrite every draft in your own words before posting. Templated comments get suppressed. "Mark posted" unlocks only after you edit.'
        )}
      </div>
      {!data?.length && (
        <div className="text-customColor18">
          {t('engagement_queue_empty', 'No drafts yet. Pull a target from the Targets tab.')}
        </div>
      )}
      {data?.map((d: any) => (
        <DraftCard key={d.id} draft={d} reload={mutate} />
      ))}
    </div>
  );
};

const DraftCard: FC<{ draft: any; reload: () => void }> = ({ draft, reload }) => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const [text, setText] = useState<string>(draft.draftText || '');
  const [busy, setBusy] = useState(false);

  // local unsaved change vs the server draft text
  const dirty = text.trim() !== (draft.draftText || '').trim() && text.trim().length > 0;
  // guardrail 5: posting is allowed only when a human edit has been saved (server sets `edited`)
  const canPost = !!draft.edited && !dirty;

  const generate = useCallback(async () => {
    setBusy(true);
    const res = await (
      await fetch(`/engagement/drafts/${draft.id}/generate`, { method: 'POST' })
    ).json();
    setText(res?.draftText || '');
    setBusy(false);
    reload();
  }, [draft.id]);

  const saveEdit = useCallback(async () => {
    setBusy(true);
    await fetch(`/engagement/drafts/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({ draftText: text }),
    });
    setBusy(false);
    reload();
    toaster.show(t('saved', 'Saved'), 'success');
  }, [draft.id, text]);

  const markPosted = useCallback(async () => {
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        /** clipboard unavailable **/
      }
    }
    const res = await fetch(`/engagement/drafts/${draft.id}/posted`, {
      method: 'POST',
    });
    if (!res.ok) {
      toaster.show(
        t('rewrite_before_posting', 'Rewrite the draft before marking it posted'),
        'warning'
      );
      return;
    }
    reload();
    toaster.show(t('copied_paste_linkedin', 'Copied — paste it on LinkedIn'), 'success');
  }, [draft.id, text]);

  const remove = useCallback(async () => {
    if (await deleteDialog(t('delete_draft_confirm', 'Delete this draft?'))) {
      await fetch(`/engagement/drafts/${draft.id}`, { method: 'DELETE' });
      reload();
    }
  }, [draft.id]);

  return (
    <div className="bg-sixth border border-fifth rounded-[4px] p-[16px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px]">
        <div className="font-[600]">{draft?.target?.name || t('target', 'Target')}</div>
        <div className="text-customColor18 text-[12px] flex-1 truncate">
          {draft?.target?.headline || ''}
        </div>
        <div className="text-[11px] px-[8px] py-[2px] rounded-[4px] bg-forth text-white">
          {draft.status}
        </div>
      </div>

      {draft.postText && (
        <div className="text-[13px] text-customColor18 whitespace-pre-wrap border border-fifth rounded-[4px] p-[10px]">
          {draft.postText}
        </div>
      )}

      <textarea
        dir="auto"
        className="w-full min-h-[110px] bg-input border border-fifth rounded-[4px] p-[10px] text-[14px] outline-none"
        value={text}
        placeholder={t('engagement_draft_placeholder', 'Comment draft — rewrite it in your own words')}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="flex gap-[8px] items-center flex-wrap">
        <Button onClick={generate} disabled={busy}>
          {busy ? t('working', 'Working...') : t('generate', 'Generate')}
        </Button>
        <Button secondary={true} onClick={saveEdit} disabled={!dirty || busy}>
          {t('save_edit', 'Save edit')}
        </Button>
        <Button onClick={markPosted} disabled={!canPost}>
          {t('mark_posted_copy', 'Mark posted · copy')}
        </Button>
        <Button secondary={true} onClick={remove}>
          {t('delete', 'Delete')}
        </Button>
        <span className="text-[11px] text-customColor18">
          {dirty
            ? t('unsaved_click_save', 'Unsaved changes. Click "Save edit".')
            : canPost
            ? t('ready_mark_posted', '"Mark posted" copies the comment for LinkedIn.')
            : t(
                'rewrite_to_enable',
                'Rewrite the comment in your own words to enable Save and Post.'
              )}
        </span>
      </div>
    </div>
  );
};

/* ---------------- Targets ---------------- */
const TargetsTab: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const list = useCallback(async () => {
    return (await fetch('/engagement/targets')).json();
  }, []);
  const { data, mutate } = useSWR('engagement-targets', list);

  const addTarget = useCallback(
    (row?: any) => () => {
      modal.openModal({
        title: row ? t('edit_target', 'Edit target') : t('add_target', 'Add target'),
        withCloseButton: true,
        children: <AddOrEditTarget data={row} reload={mutate} />,
      });
    },
    [t]
  );

  const pull = useCallback(
    (row: any) => async () => {
      const res = await (
        await fetch(`/engagement/targets/${row.id}/pull`, { method: 'POST' })
      ).json();
      mutate();
      if (res?.needsManual) {
        // Auto-pull is off (or the vendor was unavailable) -> let the human paste the post (guardrail 3).
        modal.openModal({
          title: t('paste_post', 'Paste the post to comment on'),
          withCloseButton: true,
          children: <ManualPasteDraft target={row} />,
        });
      } else {
        toaster.show(t('pulled', 'Pulled the latest post — see the Review queue'), 'success');
      }
    },
    []
  );

  const remove = useCallback(
    (row: any) => async () => {
      if (await deleteDialog(t('delete_target_confirm', `Delete ${row.name}?`, { name: row.name }))) {
        await fetch(`/engagement/targets/${row.id}`, { method: 'DELETE' });
        mutate();
      }
    },
    []
  );

  return (
    <div className="flex flex-col gap-[12px]">
      <div>
        <Button onClick={addTarget()}>{t('add_target', 'Add target')}</Button>
      </div>
      {!!data?.length && (
        <div className="grid grid-cols-[2fr,1fr,1fr,1fr] gap-y-[10px] bg-sixth border border-fifth rounded-[4px] p-[16px]">
          <div className="text-customColor18 text-[12px]">{t('person', 'Person')}</div>
          <div className="text-customColor18 text-[12px]">{t('tier', 'Tier')}</div>
          <div className="text-customColor18 text-[12px]">{t('last_pulled', 'Last pulled')}</div>
          <div className="text-customColor18 text-[12px]">{t('actions', 'Actions')}</div>
          {data.map((row: any) => (
            <React.Fragment key={row.id}>
              <div className="flex flex-col justify-center">
                <div className="font-[600]">{row.name}</div>
                <div className="text-[12px] text-customColor18 truncate">{row.headline}</div>
              </div>
              <div className="flex items-center">{t('tier', 'Tier')} {row.tier}</div>
              <div className="flex items-center text-[12px] text-customColor18">
                {row.lastPulledAt ? new Date(row.lastPulledAt).toLocaleDateString() : '—'}
              </div>
              <div className="flex items-center gap-[6px]">
                <Button onClick={pull(row)}>{t('pull', 'Pull')}</Button>
                <Button secondary={true} onClick={addTarget(row)}>{t('edit', 'Edit')}</Button>
                <Button secondary={true} onClick={remove(row)}>{t('delete', 'Delete')}</Button>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

const targetSchema = object().shape({
  name: string().required(),
  linkedinUrl: string().url().required(),
  tier: string().oneOf(['A', 'B', 'C']).required(),
});

const AddOrEditTarget: FC<{ data?: any; reload: () => void }> = ({ data, reload }) => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const form = useForm({
    resolver: yupResolver(targetSchema),
    values: {
      name: data?.name || '',
      linkedinUrl: data?.linkedinUrl || '',
      tier: data?.tier || 'B',
    },
  });
  const submit = useCallback(
    async (values: any) => {
      await fetch('/engagement/targets', {
        method: 'POST',
        body: JSON.stringify({ ...(data?.id ? { id: data.id } : {}), ...values }),
      });
      toaster.show(t('saved', 'Saved'), 'success');
      modal.closeAll();
      reload();
    },
    [data]
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="flex flex-col gap-[8px]">
          <Input label="Name" translationKey="label_name" {...form.register('name')} />
          <Input label="LinkedIn URL" translationKey="label_linkedin_url" {...form.register('linkedinUrl')} />
          <div className="flex flex-col gap-[4px]">
            <label className="text-[12px] text-customColor18">{t('tier', 'Tier')}</label>
            <select
              className="bg-input border border-fifth rounded-[4px] p-[8px] text-[14px]"
              {...form.register('tier')}
            >
              <option value="A">A — Amplifier</option>
              <option value="B">B — Buyer</option>
              <option value="C">C — Warm intro</option>
            </select>
          </div>
          <Button type="submit" className="mt-[12px]" disabled={!form.formState.isValid}>
            {t('save', 'Save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

// Manual paste path (guardrail 3): create a pending draft from a post the human pasted.
const ManualPasteDraft: FC<{ target: any }> = ({ target }) => {
  const fetch = useFetch();
  const t = useT();
  const modal = useModals();
  const toaster = useToaster();
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const save = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    await fetch('/engagement/drafts', {
      method: 'POST',
      body: JSON.stringify({
        targetId: target.id,
        postText: text,
        ...(url ? { postUrl: url } : {}),
      }),
    });
    setBusy(false);
    modal.closeAll();
    toaster.show(t('draft_created', 'Draft created — open the Review queue'), 'success');
  }, [text, url, target.id]);
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="text-[12px] text-customColor18">
        {t('paste_post_help', "Paste the post text. A pending draft appears in the Review queue.")}
      </div>
      <textarea
        dir="auto"
        className="w-full min-h-[140px] bg-input border border-fifth rounded-[4px] p-[10px] text-[14px] outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('post_text', 'Post text')}
      />
      <input
        className="bg-input border border-fifth rounded-[4px] p-[8px] text-[13px]"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t('post_url_optional', 'Post URL (optional)')}
      />
      <Button onClick={save} disabled={!text.trim() || busy}>
        {busy ? t('working', 'Working...') : t('create_draft', 'Create draft')}
      </Button>
    </div>
  );
};

/* ---------------- Account health ---------------- */
const HealthTab: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const load = useCallback(async () => {
    return (await fetch('/engagement/health')).json();
  }, []);
  const { data } = useSWR('engagement-health', load);
  const statusCount = useMemo(() => {
    const map: Record<string, number> = {};
    (data?.byStatus || []).forEach((s: any) => {
      map[s.status] = s._count?._all ?? s._count ?? 0;
    });
    return map;
  }, [data]);

  const cards = [
    { label: t('targets', 'Targets'), value: data?.targets ?? 0 },
    { label: t('comments_this_week', 'Posted this week'), value: data?.postedThisWeek ?? 0 },
    { label: t('coverage_7d', 'Targets engaged (7d)'), value: data?.coverage ?? 0 },
    { label: t('pending_drafts', 'Pending drafts'), value: statusCount['pending'] ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="bg-sixth border border-fifth rounded-[4px] p-[12px] text-[12px] text-customColor18">
        {t(
          'engagement_health_note',
          'Profile views, search appearances and SSI are private to your LinkedIn account — no API can read them. This page shows only what is real: followers you post about, your own activity, and public engagement counts.'
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
        {cards.map((c) => (
          <div key={c.label} className="bg-sixth border border-fifth rounded-[4px] p-[16px]">
            <div className="text-customColor18 text-[12px]">{c.label}</div>
            <div className="text-[26px] font-[700] mt-[6px]">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
