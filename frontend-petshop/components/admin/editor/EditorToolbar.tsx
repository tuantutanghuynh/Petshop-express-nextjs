'use client';

import { useEditorState, type Editor } from '@tiptap/react';
import { useState } from 'react';
import { ImagePanel, LinkPanel } from './InsertPanels';

type Panel = 'link' | 'image' | null;
type Tool = { key: string; label: string; text: string; className?: string; active?: boolean; disabled?: boolean; run: () => void };

const BUTTON = 'grid min-h-11 min-w-11 place-items-center rounded-[var(--radius-sm)] px-2 text-sm font-bold disabled:opacity-40 active:scale-[0.97]';

// Buttons of the rich text editor. Active states come from useEditorState, so the bar re-renders
// only when one of them changes, not on every keystroke.
export function EditorToolbar({ editor, onUploading }: { editor: Editor; onUploading?: (busy: boolean) => void }) {
  const [panel, setPanel] = useState<Panel>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const groups: Tool[][] = [
    [
      { key: 'h2', label: 'Tiêu đề lớn (hiện trong mục lục)', text: 'H2', active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
      { key: 'h3', label: 'Tiêu đề nhỏ', text: 'H3', active: s.h3, run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { key: 'bold', label: 'In đậm', text: 'B', className: 'font-extrabold', active: s.bold, run: () => chain().toggleBold().run() },
      { key: 'italic', label: 'In nghiêng', text: 'I', className: 'italic font-serif', active: s.italic, run: () => chain().toggleItalic().run() },
      { key: 'strike', label: 'Gạch ngang', text: 'S', className: 'line-through', active: s.strike, run: () => chain().toggleStrike().run() },
    ],
    [
      { key: 'bullet', label: 'Danh sách chấm', text: '•≡', active: s.bullet, run: () => chain().toggleBulletList().run() },
      { key: 'ordered', label: 'Danh sách số', text: '1.≡', active: s.ordered, run: () => chain().toggleOrderedList().run() },
      { key: 'quote', label: 'Trích dẫn', text: '❝', active: s.quote, run: () => chain().toggleBlockquote().run() },
    ],
    [
      { key: 'link', label: 'Chèn link', text: 'Link', active: s.link || panel === 'link', run: () => toggle('link') },
      { key: 'image', label: 'Chèn ảnh', text: 'Ảnh', active: panel === 'image', run: () => toggle('image') },
    ],
    [
      { key: 'undo', label: 'Hoàn tác', text: '↶', disabled: !s.canUndo, run: () => chain().undo().run() },
      { key: 'redo', label: 'Làm lại', text: '↷', disabled: !s.canRedo, run: () => chain().redo().run() },
    ],
  ];

  return (
    <div className="sticky top-[env(safe-area-inset-top,0px)] z-10 rounded-t-[var(--radius-sm)] border-b border-line bg-surface">
      <div role="toolbar" aria-label="Định dạng nội dung" className="flex flex-wrap gap-x-3 gap-y-1 p-1.5">
        {groups.map((group, i) => (
          <div key={i} className="flex gap-1">
            {group.map((t) => (
              <button key={t.key} type="button" title={t.label} aria-label={t.label} aria-pressed={t.active ?? undefined} disabled={t.disabled}
                onMouseDown={(e) => e.preventDefault()} onClick={t.run}
                className={`${BUTTON} ${t.className ?? ''} ${t.active ? 'bg-mint text-brand-ink' : 'text-ink hover:bg-surface-alt'}`}>
                <span aria-hidden="true">{t.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {panel === 'link' && <LinkPanel editor={editor} onClose={() => setPanel(null)} />}
      {panel === 'image' && <ImagePanel editor={editor} onClose={() => setPanel(null)} onUploading={onUploading} />}
    </div>
  );
}
