'use client';

import { POST_LIMITS, type PostFormValues } from '../../../lib/adminPosts';
import type { FieldErrors } from '../../../lib/forms';
import type { CategoryNode } from '../../../lib/categoryTree';
import { TextField } from '../../ui/TextField';
import { ImageUploadField } from '../ImageUploadField';
import { MarkdownField } from '../products/MarkdownField';

type Props = {
  values: PostFormValues;
  errors: FieldErrors;
  categories: (CategoryNode & { depth: number })[];
  slugLocked: boolean;
  onChange: (patch: Partial<PostFormValues>) => void;
  onTitle: (title: string) => void;
  onSlug: (slug: string) => void;
  onUploading: (busy: boolean) => void;
};

const BOX = 'w-full min-w-0 rounded-[var(--radius-sm)] border bg-surface px-3 text-base text-ink';
const count = (v: string, max: number) => `${v.trim().length}/${max}`;

function AreaField({ name, label, value, max, error, hint, rows = 3, onChange }: { name: string; label: string; value: string; max: number; error?: string; hint: string; rows?: number; onChange: (v: string) => void }) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
      <textarea id={id} name={name} rows={rows} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className={`${BOX} py-2 ${error ? 'border-pink-ink' : 'border-line'}`} />
      <p id={`${id}-hint`} className="text-xs text-muted">{hint} · {count(value, max)}</p>
      {error && <p id={`${id}-error`} className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}

// The fields of the post form, in the order of the published page: what the reader sees first,
// then the search snippet, then publishing. State and saving live in PostForm.
export function PostFields({ values, errors, categories, slugLocked, onChange, onTitle, onSlug, onUploading }: Props) {
  return (
    <>
      <TextField name="title" label="Tiêu đề *" value={values.title} error={errors.title} maxLength={POST_LIMITS.title}
        hint={`Câu hỏi người nuôi hay hỏi là tiêu đề tốt. ${count(values.title, POST_LIMITS.title)}`} onChange={(e) => onTitle(e.target.value)} />
      <TextField name="slug" label="Đường dẫn *" value={values.slug} error={errors.slug} maxLength={POST_LIMITS.slug} readOnly={slugLocked}
        inputMode="url" autoCapitalize="none" spellCheck={false}
        hint={slugLocked ? 'Bài đã đăng nên không đổi được đường dẫn (link cũ sẽ hỏng).' : `/blog/${values.slug || '…'}, tự tạo từ tiêu đề, sửa được trước khi đăng.`}
        onChange={(e) => onSlug(e.target.value)} />
      <AreaField name="excerpt" label="Tóm tắt" value={values.excerpt} max={POST_LIMITS.excerpt} error={errors.excerpt}
        hint="Hiện ở danh sách bài và đầu bài viết." onChange={(excerpt) => onChange({ excerpt })} />
      <ImageUploadField name="coverImageUrl" label="Ảnh bìa" value={values.coverImageUrl} error={errors.coverImageUrl}
        hint="JPG, PNG hoặc WebP, tối đa 15MB. Ảnh ngang hiển thị đẹp nhất." onChange={(coverImageUrl) => onChange({ coverImageUrl })} onUploading={onUploading} />
      {values.coverImageUrl && (
        <button type="button" onClick={() => onChange({ coverImageUrl: '' })} className="min-h-11 w-fit rounded-full border border-line px-4 text-sm font-bold text-ink">Bỏ ảnh bìa</button>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="f-categoryId" className="text-sm font-bold text-ink">Chủ đề</label>
        <select id="f-categoryId" name="categoryId" value={values.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} className={`${BOX} min-h-12 border-line`}>
          <option value="">Không chọn</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
        </select>
      </div>
      <MarkdownField name="content" label="Nội dung (Markdown) *" value={values.content} error={errors.content} rows={16}
        hint="## Tiêu đề mục (hiện trong mục lục), **đậm**, - gạch đầu dòng, [link](https://…), ![mô tả ảnh](link ảnh)."
        onChange={(content) => onChange({ content })} />
      <fieldset className="flex flex-col gap-4 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-bold text-ink">Hiển thị trên Google</legend>
        <TextField name="seoTitle" label="SEO title" value={values.seoTitle} error={errors.seoTitle} maxLength={POST_LIMITS.seoTitle}
          hint={`Để trống thì dùng tiêu đề. ${count(values.seoTitle, POST_LIMITS.seoTitle)}`} onChange={(e) => onChange({ seoTitle: e.target.value })} />
        <AreaField name="seoDescription" label="SEO description" value={values.seoDescription} max={POST_LIMITS.seoDescription} error={errors.seoDescription}
          hint="Để trống thì dùng tóm tắt" onChange={(seoDescription) => onChange({ seoDescription })} />
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-bold text-ink">Đăng bài</legend>
        <div className="flex flex-wrap gap-2">
          {(['draft', 'published'] as const).map((s) => (
            <label key={s} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 font-bold ${values.status === s ? 'border-brand-ink bg-mint text-brand-ink' : 'border-line text-ink'}`}>
              <input type="radio" name="status" value={s} checked={values.status === s} onChange={() => onChange({ status: s })} className="size-4" />
              {s === 'draft' ? 'Lưu nháp' : 'Đăng'}
            </label>
          ))}
        </div>
        {values.status === 'published' && (
          <TextField name="publishedAt" type="datetime-local" label="Ngày giờ đăng (giờ Việt Nam)" value={values.publishedAt} error={errors.publishedAt}
            hint="Để trống là đăng ngay. Chọn thời điểm trong tương lai để hẹn giờ." onChange={(e) => onChange({ publishedAt: e.target.value })} />
        )}
      </fieldset>
    </>
  );
}
