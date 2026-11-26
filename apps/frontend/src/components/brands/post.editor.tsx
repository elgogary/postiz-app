'use client';
// >>> SANAD-BRANDS: open Postiz's own post editor from the Brands page: a new post for the brand's channels, or an
// existing post by its group. Same modal and props as menu.tsx createPost and calendar.tsx editPost.
import { useCallback } from 'react';
import dayjs from 'dayjs';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';

const MODAL = {
  id: 'add-edit-modal', closeOnClickOutside: false, removeLayout: true, closeOnEscape: false, withCloseButton: false,
  askClose: true, fullScreen: true, classNames: { modal: 'w-[100%] max-w-[1400px] text-textColor' }, size: '80%', title: '',
};

export const usePostEditor = () => {
  const fetch = useFetch();
  const modal = useModals();
  const channels = useCallback(async () => (await (await fetch('/integrations/list')).json()).integrations as any[], [fetch]);

  const openNew = useCallback(async (channelIds: string[], date: dayjs.Dayjs, onDone: () => void) => {
    const all = await channels();
    modal.openModal({
      ...MODAL,
      children: (
        <AddEditModal allIntegrations={all.map((p) => ({ ...p }))} integrations={all} selectedChannels={channelIds}
          reopenModal={() => openNew(channelIds, date, onDone)} mutate={onDone} date={date} />
      ),
    });
  }, [channels, modal]);

  const openExisting = useCallback(async (group: string, onDone: () => void) => {
    const [all, data] = await Promise.all([channels(), fetch(`/posts/group/${group}`).then((r) => r.json())]);
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
  }, [channels, fetch, modal]);

  return { openNew, openExisting };
};
// <<< SANAD-BRANDS
