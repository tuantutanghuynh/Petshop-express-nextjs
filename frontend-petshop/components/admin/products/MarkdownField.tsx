'use client';

import { useState } from 'react';
import { renderMarkdown } from '../../../lib/markdown';

type Props = { value: string; error?: string; onChange: (v: string) => void; name?: string; label?: string; hint?: string; rows?: number };

const DEFAULT_HINT = '**đậm**, *nghiêng*, - gạch đầu dòng, [link](https://…). Tối đa 20.000 ký tự.';

// Same renderer and styles as the product page, so the preview is what visitors will see.
const PREVIEW =
  'min-h-40 max-w-prose rounded-[var(--radius-sm)] border border-line bg-surface p-3 [&_a]:text-brand-ink [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc';

// Product description by default; the post form passes its own name / label / hint.
export function MarkdownField({ value, error, onChange, name = 'description', label = 'Mô tả (Markdown)', hint = DEFAULT_HINT, rows = 10 }: Props) {
  const id = `f-${name}`;
  const [preview, setPreview] = useState(false);
  const tab = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-bold ${on ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
        <div className="flex gap-2">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>Soạn</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>Xem trước</button>
        </div>
      </div>
      {/* The textarea stays mounted (hidden) during preview so the label and form data keep working. */}
      <textarea id={id} name={name} rows={rows} value={value} hidden={preview} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-base text-ink" />
      {preview &&
        (value.trim() ? (
          // Sanitised in renderMarkdown (lib/sanitize.ts).
          <div className={PREVIEW} dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
        ) : (
          <p className={`${PREVIEW} text-muted`}>Chưa có nội dung.</p>
        ))}
      <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      {error && <p id={`${id}-error`} className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}
