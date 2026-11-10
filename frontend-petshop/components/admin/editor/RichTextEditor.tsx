'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { keepsMarkdown, richTextExtensions } from '../../../lib/richText';
import { EditorToolbar } from './EditorToolbar';

type Props = {
  name: string;
  labelId: string;
  describedBy: string;
  invalid: boolean;
  value: string;
  onChange: (markdown: string) => void;
  // Content the editor would change (a table, raw HTML): the field switches back to Markdown.
  onLossy: () => void;
  onUploading?: (busy: boolean) => void;
};

// Same look as the published page body (BlogArticle / product description), so what the admin
// sees while writing is what readers get.
const CONTENT =
  'min-h-64 max-w-none px-3 py-3 text-base leading-[1.6] text-ink outline-none [&_a]:text-brand-ink [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:leading-[1.3] [&_h2]:font-extrabold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:leading-[1.3] [&_h3]:font-bold [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-card [&_li]:ml-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_.ProseMirror-selectednode]:outline-2 [&_.ProseMirror-selectednode]:outline-brand-ink';

// The Word-like mode of MarkdownField (ADR-024). Loaded with next/dynamic (ssr: false), so Tiptap
// only ships to admin pages. Reads and writes Markdown; the parent keeps the value.
export default function RichTextEditor({ name, labelId, describedBy, invalid, value, onChange, onLossy, onUploading }: Props) {
  const [lossy] = useState(() => !keepsMarkdown(value));
  // The editor is created once; the latest onChange is read through a ref so a save never uses
  // the form state captured at the first render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: richTextExtensions(),
    content: lossy ? '' : value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: { attributes: { class: CONTENT, role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': labelId } },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getMarkdown()),
  });

  useEffect(() => {
    if (lossy) onLossy();
  }, [lossy, onLossy]);

  // Error state and hint change after the editor exists.
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: { attributes: { class: CONTENT, role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': labelId, 'aria-describedby': describedBy, ...(invalid ? { 'aria-invalid': 'true' } : {}) } },
    });
  }, [editor, labelId, describedBy, invalid]);

  // A value set from outside (form reset, loaded later) replaces the content; the editor's own
  // updates come back equal and are skipped.
  useEffect(() => {
    if (editor && !editor.isDestroyed && !lossy && value !== editor.getMarkdown()) {
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, value, lossy]);

  if (lossy) return null;
  return (
    // Named and focusable so focusFirstError (lib/forms.ts) can land here; focus moves into the text.
    <fieldset name={name} tabIndex={-1} onFocus={(e) => e.target === e.currentTarget && editor?.commands.focus()}
      className={`min-w-0 rounded-[var(--radius-sm)] border bg-surface focus-within:outline-2 focus-within:outline-brand-ink ${invalid ? 'border-pink-ink' : 'border-line'}`}>
      {editor ? (
        <>
          <EditorToolbar editor={editor} onUploading={onUploading} />
          <EditorContent editor={editor} />
        </>
      ) : (
        <div aria-busy="true" aria-label="Đang mở trình soạn thảo" className="h-64 animate-pulse bg-line" />
      )}
    </fieldset>
  );
}
