// Turns `?page=&pageSize=` into safe numbers for Prisma's skip/take, shared by every list endpoint.
//
// Each controller used to parse these inline as `Math.min(Number(pageSize) || def, max)`, which has
// two holes:
//   - a negative pageSize survives (`-5 || 12` is -5), and a negative `take` makes Prisma read the
//     list BACKWARDS from the end — `?pageSize=-5` returned the five oldest rows;
//   - `meta.page` echoed the raw query (`0`, `-1`, or `null` for "abc") instead of the page that
//     was actually served, so a client paginating from meta could never get back on track.
// Anything that is not a positive integer falls back to the default; values above the cap are
// clamped. `page` in the result is the one really used, so it is what belongs in `meta`.
export type Pagination = { page: number; take: number; skip: number };

function positiveInt(raw: unknown, fallback: number): number {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

export function parsePagination(
  query: { page?: unknown; pageSize?: unknown },
  defaultPageSize: number,
  maxPageSize: number,
): Pagination {
  const page = positiveInt(query.page, 1);
  const take = Math.min(positiveInt(query.pageSize, defaultPageSize), maxPageSize);
  return { page, take, skip: (page - 1) * take };
}

export default parsePagination;
