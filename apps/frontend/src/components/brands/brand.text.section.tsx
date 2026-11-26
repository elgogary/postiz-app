'use client';
// >>> SANAD-BRANDS: one brand-book text section. Read view sets each block's direction from its own text, so Arabic
// lines read right to left even when they start with an English term. The directions are written into the HTML
// string (memoized): React 19 re-applies innerHTML on every render of a new object, which wiped DOM-set attributes.
import { FC, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { dirOf, errorText, SectionData } from './brands.api';

// Only what the backend keeps (cleanHtml in brand.rules.ts): h3/h4, lists, bold, italic, underline, links, line breaks.
const EDITOR_OPTIONS = { heading: { levels: [3, 4] as [3, 4] }, blockquote: false, code: false, codeBlock: false, strike: false, horizontalRule: false } as const;

const withDirections = (html: string) => {
  if (typeof window === 'undefined' || !html) return html;
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
  if (!root) return html;
  root.querySelectorAll('p, li, ul, ol, h3, h4, table').forEach((el) => el.setAttribute('dir', dirOf(el.textContent || '')));
  return root.innerHTML;
};

export const BrandTextSection: FC<{
  label: string; data?: SectionData; canEdit: boolean; onSave: (html: string) => Promise<void>;
}> = ({ label, data, canEdit, onSave }) => {
  const t = useT();
  const { show } = useToaster();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useEditor({ extensions: [StarterKit.configure(EDITOR_OPTIONS)], content: data?.content || '', immediatelyRender: false });
  const inner = useMemo(() => ({ __html: withDirections(data?.content || '') }), [data?.content]);

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
          <button className="ms-auto text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] hover:bg-newColColor" onClick={() => setEditing(true)}>
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
            <button className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px]" onClick={() => setEditing(false)}>{t('cancel', 'Cancel')}</button>
            <button disabled={busy} className="text-[13px] px-[16px] h-[36px] [@media(max-width:480px)]:h-[44px] rounded-[8px] bg-[#612BD3] text-white disabled:opacity-50" onClick={save}>
              {t('save', 'Save')}
            </button>
          </div>
        </>
      ) : data?.content ? (
        <div className="text-[14px] leading-[1.75] [&_ul]:ps-[24px] [&_ul]:list-disc [&_ol]:ps-[24px] [&_ol]:list-decimal [&_strong]:font-[600] [&_p+p]:mt-[8px]"
          dangerouslySetInnerHTML={inner} />
      ) : (
        <p className="text-[14px] text-customColor18">{t('not_written_yet', 'Not written yet.')}</p>
      )}
    </article>
  );
};
// <<< SANAD-BRANDS
