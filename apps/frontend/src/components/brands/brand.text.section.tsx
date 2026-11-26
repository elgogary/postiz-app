'use client';
// >>> SANAD-BRANDS: one brand-book text section. The read view takes ONE direction from the whole section's text, so
// every line of an Arabic section starts on the right, its English headings too (per-block directions made short
// English lines jump to the left edge). A block keeps its own direction only when it is a full paragraph (12+ words)
// in the other language. Hashtags and @mentions are left-to-right islands, and "Name #HEX" lines become colour chips.
// All of it is written into the HTML string (memoized): React 19 re-applies innerHTML on every render of a new object.
import { FC, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { dirOf, errorText, SectionData } from './brands.api';

// Only what the backend keeps (cleanHtml in brand.rules.ts): h3/h4, lists, bold, italic, underline, links, line breaks.
const EDITOR_OPTIONS = { heading: { levels: [3, 4] as [3, 4] }, blockquote: false, code: false, codeBlock: false, strike: false, horizontalRule: false } as const;

const OWN_DIRECTION_WORDS = 12;
const SWATCH = /^\s*([A-Za-z][A-Za-z ]{0,20}?)\s*(#[0-9A-Fa-f]{6})\s*$/;
const TAG = /([#@][A-Za-z0-9_]+)/;
// a 600px column (about 75 characters of 15px Arabic), headings with room above, chips for colours
const READ_VIEW = 'max-w-[600px] me-auto text-[15px] leading-[1.8] [&_ul]:ps-[24px] [&_ul]:list-disc [&_ol]:ps-[24px] [&_ol]:list-decimal '
  + '[&_li+li]:mt-[4px] [&_strong]:font-[600] [&_p+p]:mt-[8px] [&_:is(h3,h4)]:text-[15px] [&_:is(h3,h4)]:font-[600] '
  + '[&_:is(h3,h4)]:mt-[24px] [&_:is(h3,h4)]:mb-[8px] [&>:first-child]:mt-0 [&_.swatches]:flex [&_.swatches]:flex-wrap '
  + '[&_.swatches]:gap-[8px] [&_.swatches]:my-[8px] [&_.swatch]:inline-flex [&_.swatch]:items-center [&_.swatch]:gap-[8px] '
  + '[&_.swatch]:py-[4px] [&_.swatch]:ps-[6px] [&_.swatch]:pe-[10px] [&_.swatch]:border [&_.swatch]:border-fifth '
  + '[&_.swatch]:rounded-[6px] [&_.swatch]:bg-input [&_.swatch]:text-[13px] [&_.swatch]:[direction:ltr] '
  + '[&_.swatch_i]:w-[16px] [&_.swatch_i]:h-[16px] [&_.swatch_i]:rounded-[4px] [&_.swatch_i]:border [&_.swatch_i]:border-fifth '
  + '[&_.swatch_code]:text-[12px] [&_.swatch_code]:text-customColor18';

const readable = (html: string): { html: string; dir: 'rtl' | 'ltr' } => {
  if (typeof window === 'undefined' || !html) return { html, dir: 'ltr' };
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return { html, dir: 'ltr' };
  const dir = dirOf(root.textContent || '');
  root.querySelectorAll('p, li, h3, h4, table').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (dirOf(text) !== dir && text.split(/\s+/).length >= OWN_DIRECTION_WORDS) el.setAttribute('dir', dirOf(text));
  });
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const tagged: Text[] = [];
  while (walker.nextNode()) if (TAG.test(walker.currentNode.nodeValue || '')) tagged.push(walker.currentNode as Text);
  tagged.forEach((node) => node.replaceWith(...(node.nodeValue || '').split(TAG).map((part, i) => {
    if (i % 2 === 0) return doc.createTextNode(part);
    const island = doc.createElement('bdi');
    island.setAttribute('dir', 'ltr');
    island.textContent = part;
    return island;
  })));
  let row: Element | null = null;
  [...root.children].forEach((el) => {
    const m = el.tagName === 'P' ? SWATCH.exec(el.textContent || '') : null;
    if (!m) { row = null; return; }
    if (!row) { row = doc.createElement('div'); row.className = 'swatches'; el.before(row); }
    const chip = doc.createElement('span');
    chip.className = 'swatch';
    const colour = doc.createElement('i');
    colour.setAttribute('style', `background:${m[2]}`);
    const code = doc.createElement('code');
    code.textContent = m[2].toUpperCase();
    chip.append(colour, `${m[1]} `, code);
    row.append(chip);
    el.remove();
  });
  return { html: root.innerHTML, dir };
};

export const BrandTextSection: FC<{
  label: string; data?: SectionData; canEdit: boolean; onSave: (html: string) => Promise<void>;
}> = ({ label, data, canEdit, onSave }) => {
  const t = useT();
  const { show } = useToaster();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useEditor({ extensions: [StarterKit.configure(EDITOR_OPTIONS)], content: data?.content || '', immediatelyRender: false });
  const read = useMemo(() => readable(data?.content || ''), [data?.content]);
  const inner = useMemo(() => ({ __html: read.html }), [read]);

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
        <div dir={read.dir} data-voice-body className={READ_VIEW} dangerouslySetInnerHTML={inner} />
      ) : (
        <p className="text-[14px] text-customColor18">{t('not_written_yet', 'Not written yet.')}</p>
      )}
    </article>
  );
};
// <<< SANAD-BRANDS
