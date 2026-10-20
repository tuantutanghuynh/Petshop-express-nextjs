'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parentOptions, slugify, validateCategoryForm, type AdminNode, type CategoryFormValues } from '../../../lib/adminCategories';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../../lib/forms';
import { MEGA_MENU_SLUGS } from '../../../lib/megaMenu';
import type { AdminCategory } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { TextField } from '../../ui/TextField';
import { AttributeEditor } from './AttributeEditor';
import { categoryApi } from './adminCategoryApi';

export type Editing = { mode: 'new'; parentId: string } | { mode: 'edit'; node: AdminNode };
type Props = { editing: Editing; nodes: AdminNode[]; root: AdminCategory; onClose: () => void; onSaved: (text: string) => void };

// Add / edit a category in a native <dialog>: a bottom sheet on phones, a right-hand drawer from lg.
// Escape, the ✕ button and a tap on the backdrop close it; focus goes back to the button that opened it.
export function CategoryEditor({ editing, nodes, root, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const node = editing.mode === 'edit' ? editing.node : null;
  const [values, setValues] = useState<CategoryFormValues>(() =>
    node
      ? { name: node.name, slug: node.slug, description: node.description ?? '', parentId: node.parentId ?? root.id }
      : { name: '', slug: '', description: '', parentId: editing.mode === 'new' ? editing.parentId : root.id },
  );
  const [slugEdited, setSlugEdited] = useState(Boolean(node));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const slugLocked = Boolean(node && MEGA_MENU_SLUGS.includes(node.slug));

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.showModal();
  }, []);

  const close = () => {
    dialog.current?.close();
  };
  const set = (patch: Partial<CategoryFormValues>) => setValues((v) => ({ ...v, ...patch }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const found = validateCategoryForm(values);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return focusFirstError(formEl, found);

    const next = { name: values.name.trim(), slug: values.slug, description: values.description.trim(), parentId: values.parentId };
    // Editing sends only what changed, so a plain rename never touches the slug or the position.
    const body: Partial<CategoryFormValues> = node ? {} : next;
    if (node) {
      if (next.name !== node.name) body.name = next.name;
      if (next.slug !== node.slug) body.slug = next.slug;
      if (next.description !== (node.description ?? '')) body.description = next.description;
      if (next.parentId !== node.parentId) body.parentId = next.parentId;
      if (Object.keys(body).length === 0) return close();
    }
    setSaving(true);
    const res = await categoryApi(node ? `/${node.id}` : '', { method: node ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    setSaving(false);
    if (res.error) {
      if (res.error.code === 'VALIDATION_ERROR') {
        const server = fieldErrors(res.error.details);
        setErrors(server);
        focusFirstError(formEl, server);
      }
      setAlert(res.error.message || 'Lưu không thành công');
      return;
    }
    onSaved(node ? `Đã lưu “${values.name.trim()}”.` : `Đã thêm “${values.name.trim()}”.`);
    close();
  }

  const options = parentOptions(nodes, root, node);
  return (
    <dialog ref={dialog} aria-labelledby="cat-editor-title"
      onClose={() => { onClose(); if (opener.current instanceof HTMLElement) opener.current.focus(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[var(--radius-lg)] bg-surface p-0 backdrop:bg-ink/60 lg:inset-y-0 lg:top-0 lg:right-0 lg:left-auto lg:h-dvh lg:max-h-none lg:w-[28rem] lg:rounded-none">
      <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <h2 id="cat-editor-title" className="text-lg leading-[1.4] font-extrabold">{node ? `Sửa “${node.name}”` : 'Thêm danh mục'}</h2>
          <button type="button" aria-label="Đóng" onClick={close} className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl">✕</button>
        </div>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <FormAlert message={alert} />
          <TextField name="name" label="Tên" maxLength={100} required value={values.name} error={errors.name}
            onChange={(e) => set({ name: e.target.value, ...(!slugEdited && { slug: slugify(e.target.value) }) })} />
          <TextField name="slug" label="Slug (đường dẫn)" maxLength={80} value={values.slug} error={errors.slug} readOnly={slugLocked}
            hint={slugLocked ? 'Slug của Chó / Mèo gắn với menu, không đổi được.' : node && values.slug !== node.slug ? `URL cũ /danh-muc/${node.slug} sẽ tự chuyển sang /danh-muc/${values.slug}.` : `Trang sẽ ở /danh-muc/${values.slug || '…'}`}
            onChange={(e) => { setSlugEdited(true); set({ slug: e.target.value }); }} />
          <div className="flex flex-col gap-1">
            <label htmlFor="f-parentId" className="text-sm font-bold text-ink">Danh mục cha</label>
            <select id="f-parentId" name="parentId" value={values.parentId} onChange={(e) => set({ parentId: e.target.value })}
              aria-invalid={errors.parentId ? true : undefined} className="min-h-12 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base">
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {errors.parentId && <p className="text-sm text-pink-ink">{errors.parentId}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="f-description" className="text-sm font-bold text-ink">Mô tả</label>
            <textarea id="f-description" name="description" rows={3} maxLength={500} value={values.description}
              aria-invalid={errors.description ? true : undefined} onChange={(e) => set({ description: e.target.value })}
              className="rounded-[var(--radius-sm)] border border-line p-3 text-base" />
            {errors.description && <p className="text-sm text-pink-ink">{errors.description}</p>}
          </div>
          <button type="submit" disabled={saving} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60">
            {saving ? 'Đang lưu…' : node ? 'Lưu thay đổi' : 'Thêm danh mục'}
          </button>
        </form>
        {node && <AttributeEditor categoryId={node.id} categoryName={node.name} />}
      </div>
    </dialog>
  );
}
