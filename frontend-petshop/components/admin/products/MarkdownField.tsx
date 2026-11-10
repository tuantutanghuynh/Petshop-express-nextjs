'use client';

import { useState } from 'react';
import { renderMarkdown } from '../../../lib/markdown';

type Props = { value: string; error?: string; onChange: (v: string) => void };

// Same renderer and styles as the product page, so the preview is what visitors will see.
const PREVIEW =
  'min-h-40 max-w-prose rounded-[var(--radius-sm)] border border-line bg-surface p-3 [&_a]:text-brand-ink [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc';

export function MarkdownField({ value, error, onChange }: Props) {
  const [preview, setPreview] = useState(false);
  const tab = (on: boolean) => `min-h-11 rounded-full px-4 text-sm font-bold ${on ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="f-description" className="text-sm font-bold text-ink">Mô tả (Markdown)</label>
        <div className="flex gap-2">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)} className={tab(!preview)}>Soạn</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)} className={tab(preview)}>Xem trước</button>
        </div>
      </div>
      {/* The textarea stays mounted (hidden) during preview so the label and form data keep working. */}
      <textarea id="f-description" name="description" rows={10} value={value} hidden={preview} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? 'f-description-error' : 'f-description-hint'}
        className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-base text-ink" />
      {preview &&
        (value.trim() ? (
          // Sanitised in renderMarkdown (lib/sanitize.ts).
          <div className={PREVIEW} dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
        ) : (
          <p className={`${PREVIEW} text-muted`}>Chưa có mô tả.</p>
        ))}
      <p id="f-description-hint" className="text-xs text-muted">**đậm**, *nghiêng*, - gạch đầu dòng, [link](https://…). Tối đa 20.000 ký tự.</p>
      {error && <p id="f-description-error" className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}
