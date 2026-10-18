type Props = { defaultValue?: string; compact?: boolean };

// Plain GET form to /tim-kiem: works before (and without) JavaScript, and the result page has a
// real URL. 16px text so iOS does not zoom on focus; enterKeyHint shows "Search" on phone keyboards.
export function SearchForm({ defaultValue = '', compact = false }: Props) {
  return (
    <form action="/tim-kiem" method="get" role="search" className="flex w-full items-center gap-2">
      <label htmlFor={compact ? 'q-header' : 'q-page'} className="sr-only">Tìm sản phẩm</label>
      <input
        id={compact ? 'q-header' : 'q-page'}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Tìm sản phẩm, ví dụ: pate mèo"
        minLength={2}
        maxLength={100}
        required
        enterKeyHint="search"
        autoComplete="off"
        className={`min-h-11 w-full min-w-0 rounded-full border border-line bg-surface px-4 text-base text-ink ${compact ? '' : 'min-h-12'}`}
      />
      <button type="submit" className="min-h-11 shrink-0 rounded-full bg-brand-ink px-5 font-bold text-white hover:bg-brand-deep">
        Tìm
      </button>
    </form>
  );
}
