// ?page=N for public list pages. Only a plain positive integer is a page: "0", "02", "1.5" or a
// repeated parameter would otherwise render a copy of some page under a second URL (duplicate
// content), so the caller answers 404 for null. Missing means page 1.
const MAX_PAGE = 10_000;

export function parsePageParam(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,4}$/.test(raw)) return null;
  const page = Number(raw);
  return page <= MAX_PAGE ? page : null;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
