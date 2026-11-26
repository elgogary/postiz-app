'use client';
// >>> SANAD-BRANDS: open Postiz's own post editor from the Brands page: a new post for the brand's channels, or an
// existing post by its group. Same modal and props as menu.tsx createPost and calendar.tsx editPost. A failed load
// shows a warning instead of a button that seems to do nothing.
import { useCallback } from 'react';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';

const MODAL = {
  id: 'add-edit-modal', closeOnClickOutside: false, removeLayout: true, closeOnEscape: false, withCloseButton: false,
  askClose: true, fullScreen: true, classNames: { modal: 'w-[100%] max-w-[1400px] text-textColor' }, size: '80%', title: '',
};

export const usePostEditor = () => {
  const fetch = useFetch();
  const modal = useModals();
  const { show } = useToaster();
  const t = useT();
  const json = useCallback(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, [fetch]);
  const failed = useCallback(() => show(t('editor_not_opened', 'The post editor could not open. Try again.'), 'warning'), [show, t]);

  const openNew = useCallback(async (channelIds: string[], date: dayjs.Dayjs, onDone: () => void) => {
    try {
      const all = (await json('/integrations/list')).integrations as any[];
      modal.openModal({
        ...MODAL,
        children: (
          <AddEditModal allIntegrations={all.map((p) => ({ ...p }))} integrations={all} selectedChannels={channelIds}
            reopenModal={() => openNew(channelIds, date, onDone)} mutate={onDone} date={date} />
        ),
      });
    } catch {
      failed();
    }
  }, [json, modal, failed]);

  const openExisting = useCallback(async (group: string, onDone: () => void) => {
    try {
      const [list, data] = await Promise.all([json('/integrations/list'), json(`/posts/group/${group}`)]);
      const all = list.integrations as any[];
      modal.openModal({
        ...MODAL,
        children: (
          <ExistingDataContextProvider value={data}>
            <AddEditModal allIntegrations={all.map((p) => ({ ...p }))}
              integrations={all.filter((f) => f.id === data.integration).map((p) => ({ ...p, picture: data.integrationPicture }))}
              reopenModal={() => openExisting(group, onDone)} mutate={onDone} date={dayjs.utc(data.posts[0].publishDate).local()} />
          </ExistingDataContextProvider>
        ),
      });
    } catch {
      failed();
    }
  }, [json, modal, failed]);

  return { openNew, openExisting };
};
// <<< SANAD-BRANDS
