'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

type Props = { value: string; error?: string; onChange: (v: string) => void; name?: string; label?: string; hint?: string; rows?: number; onUploading?: (busy: boolean) => void };

const DEFAULT_HINT = 'Dùng thanh công cụ để in đậm, tạo danh sách, chèn link. Tối đa 20.000 ký tự.';
const MARKDOWN_HINT = '**đậm**, *nghiêng*, ## tiêu đề, - gạch đầu dòng, [link](https://…), ![mô tả ảnh](link ảnh).';

// Tiptap ships only when this field is on screen (admin pages), never to the storefront.
const RichTextEditor = dynamic(() => import('../editor/RichTextEditor'), {
  ssr: false,
  loading: () => <div aria-busy="true" aria-label="Đang mở trình soạn thảo" className="h-64 animate-pulse rounded-[var(--radius-sm)] bg-line" />,
});

// Product description by default; the post form passes its own name / label / hint. The value is
// Markdown in both modes (ADR-024): "Soạn" edits it like a document, "Markdown" shows the source.
export function MarkdownField({ value, error, onChange, name = 'description', label = 'Mô tả', hint = DEFAULT_HINT, rows = 10, onUploading }: Props) {
  const id = `f-${name}`;
  const [mode, setMode] = useState<'rich' | 'markdown'>('rich');
  const [lossy, setLossy] = useState(false);
  const onLossy = useCallback(() => {
    setLossy(true);
    setMode('markdown');
  }, []);
  const describedBy = error ? `${id}-error` : `${id}-hint`;
  const tab = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-bold ${on ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === 'markdown' ? (
          <label id={`${id}-label`} htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
        ) : (
          <span id={`${id}-label`} className="text-sm font-bold text-ink">{label}</span>
        )}
        <div className="flex gap-2">
          <button type="button" aria-pressed={mode === 'rich'} onClick={() => { setLossy(false); setMode('rich'); }} className={tab(mode === 'rich')}>Soạn</button>
          <button type="button" aria-pressed={mode === 'markdown'} onClick={() => setMode('markdown')} className={tab(mode === 'markdown')}>Markdown</button>
        </div>
      </div>
      {lossy && (
        <p role="status" className="rounded-card bg-peach px-3 py-2 text-sm text-orange-text">
          Nội dung có bảng hoặc mã HTML mà trình soạn chưa hỗ trợ, nên đang mở ở chế độ Markdown để không mất dữ liệu.
        </p>
      )}
      {mode === 'rich' ? (
        <RichTextEditor name={name} labelId={`${id}-label`} describedBy={describedBy} invalid={Boolean(error)} value={value} onChange={onChange} onLossy={onLossy} onUploading={onUploading} />
      ) : (
        <textarea id={id} name={name} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-3 font-mono text-base text-ink" />
      )}
      <p id={`${id}-hint`} className="text-xs text-muted">{mode === 'markdown' ? MARKDOWN_HINT : hint}</p>
      {error && <p id={`${id}-error`} className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}
