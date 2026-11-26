'use client';
// >>> SANAD-BRANDS: one brand-book text section. Read view sets each block's direction from its own text, so Arabic
// lines read right to left even when they start with an English term.
import { FC, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { AR, errorText, SectionData } from './brands.api';

export const setDirections = (root: HTMLElement | null) => {
  root?.querySelectorAll('p, li, ul, ol, h3, h4, table').forEach((el) => el.setAttribute('dir', AR.test(el.textContent || '') ? 'rtl' : 'ltr'));
};

export const BrandTextSection: FC<{
  label: string; data?: SectionData; canEdit: boolean; onSave: (html: string) => Promise<void>;
}> = ({ label, data, canEdit, onSave }) => {
  const t = useT();
  const { show } = useToaster();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const editor = useEditor({ extensions: [StarterKit], content: data?.content || '', immediatelyRender: false });

  useEffect(() => { setDirections(view.current); }, [data?.content, editing]);
  useEffect(() => { if (editing) editor?.commands.setContent(data?.content || ''); }, [editing]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(editor?.getHTML() || '');
      setEditing(false);
      show(t('saved', 'Saved'), 'success');
    } catch (e) {
      show(errorText(e, t), 'warning');
    }
    setBusy(false);
  };

  return (
    <article className="bg-sixth border border-fifth rounded-[12px] p-[24px] flex flex-col gap-[16px]">
      <div className="flex items-start gap-[16px]">
        <div>
          <h3 className="text-[16px] font-[600]">{label}</h3>
          {data?.updatedBy && !editing && (
            <div className="text-[12px] text-customColor18">
              {t('last_edited_by', 'Last edited by')} {data.updatedBy} · {new Date(data.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
        {canEdit && !editing && (
          <button className="ms-auto text-[13px] px-[16px] h-[36px] rounded-[8px] hover:bg-newColColor" onClick={() => setEditing(true)}>
            {t('edit', 'Edit')}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <div className="bg-input border border-fifth rounded-[8px] p-[16px] min-h-[200px] [&_.ProseMirror]:outline-none [&_.ProseMirror_:is(p,li,h3,h4)]:[unicode-bidi:plaintext] [&_.ProseMirror_:is(p,li,h3,h4)]:text-start">
            <EditorContent editor={editor} />
          </div>
          <div className="flex justify-end gap-[8px]">
            <button className="text-[13px] px-[16px] h-[36px] rounded-[8px]" onClick={() => setEditing(false)}>{t('cancel', 'Cancel')}</button>
            <button disabled={busy} className="text-[13px] px-[16px] h-[36px] rounded-[8px] bg-[#612BD3] text-white disabled:opacity-50" onClick={save}>
              {t('save', 'Save')}
            </button>
          </div>
        </>
      ) : data?.content ? (
        <div ref={view} className="text-[14px] leading-[1.75] [&_ul]:ps-[24px] [&_ul]:list-disc [&_ol]:ps-[24px] [&_ol]:list-decimal [&_strong]:font-[600] [&_p+p]:mt-[8px]"
          dangerouslySetInnerHTML={{ __html: data.content }} />
      ) : (
        <p className="text-[14px] text-customColor18">{t('not_written_yet', 'Not written yet.')}</p>
      )}
    </article>
  );
};
// <<< SANAD-BRANDS
