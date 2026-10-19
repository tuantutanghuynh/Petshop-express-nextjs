import type { Category } from '../../lib/types';

type Props = { defaultValue?: string; compact?: boolean; categories?: Category[]; defaultCategory?: string };

// Plain GET form to /tim-kiem (works before and without JavaScript; results have a real URL).
// With categories it shows the wireframe's "Tất cả danh mục" select (?danh-muc=). 16px text so iOS
// does not zoom on focus; enterKeyHint shows "Search" on phone keyboards.
export function SearchForm({ defaultValue = '', compact = false, categories = [], defaultCategory = '' }: Props) {
  const id = compact ? 'q-header' : 'q-page';
  return (
    <form action="/tim-kiem" method="get" role="search" className="flex w-full items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-full border border-line bg-surface focus-within:outline-3 focus-within:outline-brand-ink">
        <label htmlFor={id} className="sr-only">Tìm sản phẩm</label>
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={compact ? 'Tìm sản phẩm…' : 'Tìm sản phẩm, ví dụ: pate mèo'}
          minLength={2}
          maxLength={100}
          required
          enterKeyHint="search"
          autoComplete="off"
          className={`w-full min-w-0 flex-1 rounded-full bg-transparent px-4 text-base text-ink outline-none ${compact ? 'min-h-11' : 'min-h-12'}`}
        />
        {categories.length > 0 && (
          <>
            <label htmlFor={`${id}-cat`} className="sr-only">Danh mục</label>
            <select
              id={`${id}-cat`}
              name="danh-muc"
              defaultValue={defaultCategory}
              className="hidden min-h-11 max-w-44 shrink-0 border-l border-line bg-transparent px-3 text-sm text-ink sm:block"
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </>
        )}
      </div>
      <button type="submit" aria-label="Tìm" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-ink text-lg text-white hover:bg-brand-deep">
        <span aria-hidden="true">⌕</span>
      </button>
    </form>
  );
}
