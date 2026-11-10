'use client';

import type { Editor } from '@tiptap/react';
import { useId, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { markdownImage, safeLinkHref } from '../../../lib/richText';
import type { UploadResult } from '../../../lib/types';

// Inline panels under the toolbar. They are divs, not <form>s: the editor already sits inside the
// post / product form and forms cannot nest. Enter in a field runs the main action.
const INPUT = 'min-h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base text-ink';
const PRIMARY = 'min-h-11 rounded-full bg-brand-ink px-5 font-bold text-white disabled:opacity-60';
const SECONDARY = 'min-h-11 rounded-full border border-line px-5 font-bold text-ink';

function Panel({ title, error, children }: { title: string; error: string | null; children: ReactNode }) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2 border-t border-line bg-surface-alt p-3">
      {children}
      {error && <p role="alert" className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}

const onEnter = (run: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

export function LinkPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const id = useId();
  const [href, setHref] = useState(() => String(editor.getAttributes('link').href ?? ''));
  const [error, setError] = useState<string | null>(null);
  const hasLink = editor.isActive('link');

  function apply() {
    const safe = safeLinkHref(href);
    if (!safe) return setError('Link phải bắt đầu bằng https://, mailto:, tel: hoặc / (trang trong web).');
    const chain = editor.chain().focus().extendMarkRange('link');
    // Nothing selected: the address itself becomes the link text.
    if (editor.state.selection.empty && !hasLink) chain.insertContent({ type: 'text', text: safe, marks: [{ type: 'link', attrs: { href: safe } }] }).run();
    else chain.setLink({ href: safe }).run();
    onClose();
  }

  return (
    <Panel title="Chèn link" error={error}>
      <label htmlFor={`${id}-href`} className="text-sm font-bold text-ink">Địa chỉ link</label>
      <input id={`${id}-href`} type="url" inputMode="url" autoCapitalize="none" spellCheck={false} enterKeyHint="done" autoFocus
        placeholder="https://… hoặc /danh-muc/meo" value={href} onChange={(e) => { setHref(e.target.value); setError(null); }} onKeyDown={onEnter(apply)} className={INPUT} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={apply} className={PRIMARY}>{hasLink ? 'Cập nhật link' : 'Chèn link'}</button>
        {hasLink && (
          <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose(); }} className={SECONDARY}>Bỏ link</button>
        )}
        <button type="button" onClick={() => { editor.commands.focus(); onClose(); }} className={SECONDARY}>Huỷ</button>
      </div>
    </Panel>
  );
}

export function ImagePanel({ editor, onClose, onUploading }: { editor: Editor; onClose: () => void; onUploading?: (busy: boolean) => void }) {
  const id = useId();
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!alt.trim()) return setError('Nhập mô tả ảnh trước (giúp người đọc và Google hiểu ảnh).');
    setError(null);
    setBusy(true);
    onUploading?.(true);
    const body = new FormData();
    body.append('image', file);
    try {
      const res = await authFetch<UploadResult>('/uploads/image', { method: 'POST', body });
      const attrs = res.data ? markdownImage(alt, res.data.url) : null;
      if (!attrs) return setError(res.error?.message || 'Chưa tải được ảnh lên.');
      editor.chain().focus().setImage(attrs).run();
      onClose();
    } catch {
      setError('Chưa tải được ảnh lên. Kiểm tra mạng rồi thử lại.');
    } finally {
      setBusy(false);
      onUploading?.(false);
    }
  }

  return (
    <Panel title="Chèn ảnh" error={error}>
      <label htmlFor={`${id}-alt`} className="text-sm font-bold text-ink">Mô tả ảnh *</label>
      <input id={`${id}-alt`} type="text" maxLength={200} enterKeyHint="done" autoFocus placeholder="vd: Mèo con 2 tháng tuổi đang ăn pate"
        value={alt} onChange={(e) => { setAlt(e.target.value); setError(null); }} onKeyDown={onEnter(() => document.getElementById(`${id}-file`)?.click())} className={INPUT} />
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-file`} className={`${PRIMARY} inline-flex cursor-pointer items-center focus-within:outline-2 ${busy ? 'opacity-60' : ''}`}>
          {busy ? 'Đang tải ảnh lên…' : 'Chọn ảnh từ máy'}
          <input id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => void onFile(e)} />
        </label>
        <button type="button" onClick={() => { editor.commands.focus(); onClose(); }} className={SECONDARY}>Huỷ</button>
      </div>
      <p className="text-xs text-muted">JPG, PNG hoặc WebP, tối đa 15MB.</p>
    </Panel>
  );
}
