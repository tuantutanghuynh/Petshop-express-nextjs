// Readers for owner-editable homepage settings (/admin/cau-hinh → GET /api/v1/settings). Values are
// strings, structured ones JSON. Anything missing or malformed falls back to safe defaults: the
// public pages never show a broken link, a non-https image, or a promotion outside its dates.
// Tested in test/settings.test.ts.

export const SETTING_KEYS = {
  announcements: 'announcement_items',
  categoryImages: 'homepage_category_images',
  heroBadge: 'homepage_hero_badge',
  heroCta2Label: 'homepage_hero_cta2_label',
  heroCta2Href: 'homepage_hero_cta2_href',
} as const;

export const MAX_ANNOUNCEMENTS = 3;

function parseJson(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // malformed setting = not set
  }
}

// Announcement bar lines, or null when nothing usable was saved (the bar then shows its defaults).
export function parseAnnouncements(raw: string | undefined): string[] | null {
  const value = parseJson(raw);
  if (!Array.isArray(value)) return null;
  const lines = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, MAX_ANNOUNCEMENTS);
  return lines.length > 0 ? lines : null;
}

const VN_OFFSET_MS = 7 * 3_600_000; // Asia/Ho_Chi_Minh, no daylight saving
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Start of a "YYYY-MM-DD" day in Vietnam, as a UTC timestamp; undefined for anything else.
function vnDayStart(day: unknown, addDays = 0): number | undefined {
  if (typeof day !== 'string') return undefined;
  const m = DAY.exec(day);
  if (!m) return undefined;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays) - VN_OFFSET_MS;
}

// A promotion runs from 00:00 of startsAt to 23:59:59 of endsAt, Vietnam time (the owner thinks in
// local days). Missing or malformed dates leave that side open.
export function isWithinDates(p: { startsAt?: unknown; endsAt?: unknown }, now: Date = new Date()): boolean {
  const start = vnDayStart(p.startsAt);
  const end = vnDayStart(p.endsAt, 1);
  const t = now.getTime();
  return (start === undefined || t >= start) && (end === undefined || t < end);
}

// { categorySlug: imageUrl } for the homepage category circles; https images only.
export function parseCategoryImages(raw: string | undefined): Record<string, string> {
  const value = parseJson(raw);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [slug, url] of Object.entries(value)) {
    if (/^[a-z0-9-]{1,80}$/.test(slug) && typeof url === 'string' && url.startsWith('https://')) out[slug] = url;
  }
  return out;
}
