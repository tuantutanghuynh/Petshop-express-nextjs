# Hero Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Homepage hero becomes an auto-playing, accessible slider whose slides the owner adds / edits / deletes / reorders in `/admin/cau-hinh`.

**Architecture:** Slides are one JSON setting `homepage_hero_slides`, parsed on the server by a pure `lib/heroSlides.ts` (dates, safety, legacy fallback). The existing hero markup becomes a reusable `HeroSlideView`; `Hero` (static, 1 slide) and a new client `HeroSlider` (2+ slides) both use it. The admin form replaces its single hero block with a list of slide fieldsets.

**Tech Stack:** Next.js 16.3.4, React 19 (`inert`, `useSyncExternalStore`), Tailwind v4, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-hero-slider-design.md`.
- Setting `homepage_hero_slides`; `MAX_HERO_SLIDES = 6`; lengths: badge 40, title 80, accent 80, subtitle 240, button label 30.
- Visible slide: `enabled !== false`, non-empty title, within `isWithinDates` (Vietnam days).
- Setting missing or "" → one slide from legacy `homepage_hero_*`; setting present with no visible slide → default hero.
- Links via `isSafeHref`, images `https://` then `imageSrc()`.
- Autoplay 6000 ms; pause on hover / focus inside / hidden tab / ⏸; `prefers-reduced-motion` → no autoplay by default, no fade.
- Exactly one `<h1>` (slide 1); later slides `<h2>`; slide 1 image `fetchPriority="high"`, others lazy. CLS 0 (stacked grid).
- Tap targets ≥ 44px; no horizontal scroll at 320px (dots hidden below `sm`, "N / M" shown instead).
- No `any`, no `eslint-disable`, no setState synchronously in effects. Commits short, no attribution, user approves first; never commit `docs/`, the PDF or the user's guide `.md` files.

---

### Task 1: `lib/heroSlides.ts` — parse slides

**Files:**
- Create: `frontend-petshop/lib/heroSlides.ts`
- Modify: `frontend-petshop/components/home/Hero.tsx` (import `HeroContent` from lib instead of declaring it)
- Test: `frontend-petshop/test/heroSlides.test.ts`

**Interfaces:**
- Produces:
  - `type HeroContent = { badge: string; title: string; accent: string; subtitle: string; ctaLabel: string; ctaHref: string; cta2: { label: string; href: string } | null; image: string | null }`
  - `HERO_SLIDES_KEY = 'homepage_hero_slides'`, `MAX_HERO_SLIDES = 6`, `HERO_LIMITS = { badge: 40, title: 80, accent: 80, subtitle: 240, label: 30 }`
  - `LEGACY_HERO_KEYS: string[]` (the 9 `homepage_hero_*` keys)
  - `legacyHero(s: Record<string, string | undefined>): HeroContent` (the old `heroFrom`, defaults included)
  - `parseHeroSlides(s: Record<string, string | undefined>, now?: Date): HeroContent[]` (≥ 1 item)
  - `nextIndex(i: number, n: number, dir: -1 | 1): number`

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/heroSlides.test.ts
import { describe, expect, it } from 'vitest';
import { HERO_SLIDES_KEY, MAX_HERO_SLIDES, legacyHero, nextIndex, parseHeroSlides } from '../lib/heroSlides';

// Homepage hero slides (spec 2026-10-21): edited in /admin/cau-hinh, stored as JSON. Whatever is
// stored, the homepage shows at least one safe slide, and the old single hero keeps working until
// the owner saves a slide list.
const now = new Date('2026-10-21T05:00:00Z');
const slides = (list: unknown[]) => ({ [HERO_SLIDES_KEY]: JSON.stringify(list) });

describe('parseHeroSlides', () => {
  it('uses the old single hero until a slide list is saved', () => {
    const out = parseHeroSlides({ homepage_hero_title: 'Cũ' }, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Cũ', ctaLabel: 'Mua ngay', ctaHref: '/san-pham' });
    expect(parseHeroSlides({ [HERO_SLIDES_KEY]: '' }, now)[0].title).toBe(legacyHero({}).title);
  });

  it('reads saved slides in order, with safe defaults for the main button', () => {
    const out = parseHeroSlides(slides([
      { title: 'Một', accent: 'nhấn', ctaLabel: 'Xem', ctaHref: '/danh-muc/cho', cta2Label: 'Tư vấn', cta2Href: '/tu-van-bao-gia', image: 'https://res.cloudinary.com/x/a.jpg' },
      { title: 'Hai', ctaLabel: 'Xem', ctaHref: 'javascript:alert(1)', cta2Label: 'Thiếu link' },
    ]), now);
    expect(out.map((s) => s.title)).toEqual(['Một', 'Hai']);
    expect(out[0]).toMatchObject({ ctaLabel: 'Xem', ctaHref: '/danh-muc/cho', cta2: { label: 'Tư vấn', href: '/tu-van-bao-gia' }, image: 'https://res.cloudinary.com/x/a.jpg' });
    expect(out[1]).toMatchObject({ ctaLabel: 'Mua ngay', ctaHref: '/san-pham', cta2: null, image: null, badge: '' });
  });

  it('hides disabled, untitled and out-of-date slides', () => {
    const out = parseHeroSlides(slides([
      { title: 'Tắt', enabled: false },
      { title: '' },
      { title: 'Chưa tới', startsAt: '2026-11-01' },
      { title: 'Hết hạn', endsAt: '2026-10-20' },
      { title: 'Đang chạy', startsAt: '2026-10-21', endsAt: '2026-10-21' },
    ]), now);
    expect(out.map((s) => s.title)).toEqual(['Đang chạy']);
  });

  it('falls back to the default hero when nothing saved is visible', () => {
    expect(parseHeroSlides(slides([{ title: 'Tắt', enabled: false }]), now)).toEqual([legacyHero({})]);
    expect(parseHeroSlides({ [HERO_SLIDES_KEY]: '{oops' }, now)).toEqual([legacyHero({})]);
  });

  it(`keeps at most ${MAX_HERO_SLIDES} slides and cuts over-long text`, () => {
    const out = parseHeroSlides(slides(Array.from({ length: 9 }, (_, i) => ({ title: `S${i}`, subtitle: 'x'.repeat(300) }))), now);
    expect(out).toHaveLength(MAX_HERO_SLIDES);
    expect(out[0].subtitle).toHaveLength(240);
  });

  it('drops images from hosts next/image cannot load', () => {
    expect(parseHeroSlides(slides([{ title: 'A', image: 'https://evil.example/a.jpg' }]), now)[0].image).toBeNull();
  });
});

describe('nextIndex', () => {
  it('wraps around both ways', () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
  });
});
```
Run `npx vitest run test/heroSlides.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/heroSlides.ts
import { isWithinDates } from './settings';
import { imageSrc, isSafeHref } from './storefront';

// Homepage hero slides (spec 2026-10-21, test/heroSlides.test.ts), edited in /admin/cau-hinh and
// stored as a JSON list in homepage_hero_slides. Parsed on the server: the slider only receives
// slides that are on, titled, within their dates and safe to render. Until a list is saved, the
// older single hero (homepage_hero_* keys) is the one slide.
export type HeroContent = {
  badge: string;
  title: string;
  accent: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  cta2: { label: string; href: string } | null;
  image: string | null;
};

export const HERO_SLIDES_KEY = 'homepage_hero_slides';
export const MAX_HERO_SLIDES = 6;
export const HERO_LIMITS = { badge: 40, title: 80, accent: 80, subtitle: 240, label: 30 } as const;
export const LEGACY_HERO_KEYS = ['badge', 'title', 'accent', 'subtitle', 'cta_label', 'cta_href', 'cta2_label', 'cta2_href', 'image'].map((k) => `homepage_hero_${k}`);

const MAIN_CTA = { label: 'Mua ngay', href: '/san-pham' };
type Settings = Record<string, string | undefined>;

// The single hero used before slides existed, with the wireframe copy as defaults.
export function legacyHero(s: Settings): HeroContent {
  const href = s.homepage_hero_cta_href;
  const cta2Href = s.homepage_hero_cta2_href;
  return {
    badge: s.homepage_hero_badge ?? '♥ Yêu thương & chăm sóc',
    title: s.homepage_hero_title || 'Lựa chọn tốt nhất',
    accent: s.homepage_hero_accent || 'cho bé cưng nhà bạn',
    subtitle: s.homepage_hero_subtitle || 'Thức ăn dinh dưỡng, pate, phụ kiện chất lượng và kiến thức chăm sóc chó mèo từ người nuôi thật.',
    ctaLabel: s.homepage_hero_cta_label || MAIN_CTA.label,
    ctaHref: href && isSafeHref(href) ? href : MAIN_CTA.href,
    cta2: { label: s.homepage_hero_cta2_label || 'Nhờ tư vấn', href: cta2Href && isSafeHref(cta2Href) ? cta2Href : '/tu-van-bao-gia' },
    image: imageSrc(s.homepage_hero_image),
  };
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const link = (label: unknown, href: unknown) => {
  const l = text(label, HERO_LIMITS.label);
  const h = text(href, 2000);
  return l && h && isSafeHref(h) ? { label: l, href: h } : null;
};

function readSlide(v: Record<string, unknown>, now: Date): HeroContent | null {
  const title = text(v.title, HERO_LIMITS.title);
  if (v.enabled === false || !title || !isWithinDates(v, now)) return null;
  const main = link(v.ctaLabel, v.ctaHref) ?? MAIN_CTA;
  const image = text(v.image, 2000);
  return {
    badge: text(v.badge, HERO_LIMITS.badge),
    title,
    accent: text(v.accent, HERO_LIMITS.accent),
    subtitle: text(v.subtitle, HERO_LIMITS.subtitle),
    ctaLabel: main.label,
    ctaHref: main.href,
    cta2: link(v.cta2Label, v.cta2Href),
    image: image.startsWith('https://') ? imageSrc(image) : null,
  };
}

export function parseHeroSlides(s: Settings, now: Date = new Date()): HeroContent[] {
  const raw = s[HERO_SLIDES_KEY];
  if (!raw) return [legacyHero(s)];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null; // malformed list = nothing visible
  }
  const visible = (Array.isArray(value) ? value : [])
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => readSlide(v, now))
    .filter((v): v is HeroContent => v !== null)
    .slice(0, MAX_HERO_SLIDES);
  return visible.length > 0 ? visible : [legacyHero({})];
}

export const nextIndex = (i: number, n: number, dir: -1 | 1) => (i + dir + n) % n;
```
`components/home/Hero.tsx`: delete the local `HeroContent` type, `import type { HeroContent } from '../../lib/heroSlides';` and re-export it (`export type { HeroContent }`) so `app/page.tsx` keeps compiling until Task 3.

- [ ] **Step 3: Run** → PASS; `npm run typecheck`.

---

### Task 2: Admin form — slides instead of the single hero

**Files:**
- Modify: `frontend-petshop/lib/adminSettings.ts`
- Create: `frontend-petshop/components/admin/settings/HeroSlideFields.tsx`
- Modify: `frontend-petshop/components/admin/settings/SettingsEditor.tsx`
- Test: `frontend-petshop/test/adminSettings.test.ts` (replace the three `form.hero` usages — spec change — and add slide cases)

**Interfaces:**
- Consumes: Task 1 constants, `legacyHero`.
- Produces: `type HeroSlideForm = { enabled: boolean; badge: string; title: string; accent: string; subtitle: string; ctaLabel: string; ctaHref: string; cta2Label: string; cta2Href: string; image: string; startsAt: string; endsAt: string }`; `SettingsForm.heroSlides: HeroSlideForm[]` (0–6 rows); `EMPTY_HERO_SLIDE`; `SettingsForm.hero` removed.

- [ ] **Step 1: Tests**

Replace in `test/adminSettings.test.ts`:
- in "refuses links…": `form.hero.ctaHref = 'javascript:alert(1)';` → `form.heroSlides[0].ctaHref = 'javascript:alert(1)';` and `'hero.ctaHref'` → `'heroSlides.0.ctaHref'` in the expected list.
- in "trims text…": `form.hero.title = '  Tiêu đề ';` → `form.heroSlides[0].title = '  Tiêu đề ';` and the last assertion → `expect(JSON.parse(settings.homepage_hero_slides)[0].title).toBe('Tiêu đề');`.
Add a comment above them: `// The single hero became slides (spec 2026-10-21); slide 1 is prefilled from the old keys.`

Append:
```ts
describe('hero slides settings', () => {
  it('prefills slide 1 from the old hero keys until slides are saved', () => {
    const form = settingsToForm({ homepage_hero_title: 'Cũ', homepage_hero_image: 'https://res.cloudinary.com/x/h.jpg' });
    expect(form.heroSlides).toHaveLength(1);
    expect(form.heroSlides[0]).toMatchObject({ enabled: true, title: 'Cũ', ctaLabel: 'Mua ngay', ctaHref: '/san-pham', image: 'https://res.cloudinary.com/x/h.jpg' });
    expect(ADMIN_SETTING_KEYS).toContain('homepage_hero_slides');
  });

  it('round-trips saved slides, keeping disabled and dated ones for editing', () => {
    const saved = [
      { enabled: false, title: 'Tắt', ctaLabel: 'Xem', ctaHref: '/a' },
      { enabled: true, title: 'Hai', startsAt: '2026-11-01', endsAt: '2026-11-30' },
    ];
    const form = settingsToForm({ homepage_hero_slides: JSON.stringify(saved) });
    expect(form.heroSlides.map((s) => s.title)).toEqual(['Tắt', 'Hai']);
    const { settings, errors } = formToSettings(form);
    expect(errors).toEqual({});
    expect(JSON.parse(settings.homepage_hero_slides)).toEqual(saved);
  });

  it('drops empty slides and flags a missing title, a button without link, a bad image and reversed dates', () => {
    const form = settingsToForm({ homepage_hero_slides: '[]' });
    expect(form.heroSlides).toEqual([]);
    const blank = { enabled: true, badge: '', title: '', accent: '', subtitle: '', ctaLabel: '', ctaHref: '', cta2Label: '', cta2Href: '', image: '', startsAt: '', endsAt: '' };
    form.heroSlides = [blank, { ...blank, subtitle: 'x', cta2Label: 'Tư vấn', image: 'http://a/b.jpg', startsAt: '2026-11-02', endsAt: '2026-11-01' }];
    const { settings, errors } = formToSettings(form);
    expect(Object.keys(errors).sort()).toEqual(['heroSlides.1.cta2Href', 'heroSlides.1.endsAt', 'heroSlides.1.image', 'heroSlides.1.title']);
    expect(settings.homepage_hero_slides).toBeDefined();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement in `lib/adminSettings.ts`**
- Remove `HERO_KEYS`, `hero` from `SettingsForm`, `readKeys(HERO_KEYS…)`, the hero block in `formToSettings` (writeKeys + href/image checks).
- `ADMIN_SETTING_KEYS`: replace `...Object.values(HERO_KEYS)` with `...LEGACY_HERO_KEYS, HERO_SLIDES_KEY`.
- Add:
```ts
export type HeroSlideForm = {
  enabled: boolean; badge: string; title: string; accent: string; subtitle: string;
  ctaLabel: string; ctaHref: string; cta2Label: string; cta2Href: string; image: string; startsAt: string; endsAt: string;
};
export const EMPTY_HERO_SLIDE: HeroSlideForm = {
  enabled: true, badge: '', title: '', accent: '', subtitle: '', ctaLabel: '', ctaHref: '', cta2Label: '', cta2Href: '', image: '', startsAt: '', endsAt: '',
};
const SLIDE_TEXT = ['badge', 'title', 'accent', 'subtitle', 'ctaLabel', 'ctaHref', 'cta2Label', 'cta2Href', 'image', 'startsAt', 'endsAt'] as const;

// Every saved slide (on or off, any dates) so the owner can edit it; before the first save, slide 1
// is what the homepage shows today (the old hero keys with their defaults).
function readHeroSlides(s: Record<string, string>): HeroSlideForm[] {
  const raw = s[HERO_SLIDES_KEY];
  if (!raw) {
    const h = legacyHero(s);
    return [{ ...EMPTY_HERO_SLIDE, badge: h.badge, title: h.title, accent: h.accent, subtitle: h.subtitle, ctaLabel: h.ctaLabel, ctaHref: h.ctaHref,
      cta2Label: h.cta2?.label ?? '', cta2Href: h.cta2?.href ?? '', image: s.homepage_hero_image ?? '' }];
  }
  let list: unknown;
  try { list = JSON.parse(raw); } catch { list = []; }
  return (Array.isArray(list) ? list : []).filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .slice(0, MAX_HERO_SLIDES)
    .map((v) => ({ ...EMPTY_HERO_SLIDE, enabled: v.enabled !== false, ...Object.fromEntries(SLIDE_TEXT.map((k) => [k, typeof v[k] === 'string' ? v[k] : ''])) }));
}

// homepage_hero_slides JSON (always a list, possibly empty → the homepage then shows the default hero).
function writeHeroSlides(rows: HeroSlideForm[], errors: FieldErrors): string {
  const out = rows.flatMap((raw, i) => {
    const v = Object.fromEntries(SLIDE_TEXT.map((k) => [k, raw[k].trim()])) as Record<(typeof SLIDE_TEXT)[number], string>;
    if (SLIDE_TEXT.every((k) => !v[k])) return [];
    const at = (k: string) => `heroSlides.${i}.${k}`;
    if (!v.title) errors[at('title')] = 'Nhập tiêu đề';
    for (const [label, href] of [['ctaLabel', 'ctaHref'], ['cta2Label', 'cta2Href']] as const) {
      if (v[href] && !isSafeHref(v[href])) errors[at(href)] = 'Link phải bắt đầu bằng / hoặc https://';
      else if (v[label] && !v[href]) errors[at(href)] = 'Nhập link cho nút này';
    }
    if (v.image && !isHttps(v.image)) errors[at('image')] = 'Ảnh phải là link https://';
    if (v.startsAt && !DAY.test(v.startsAt)) errors[at('startsAt')] = 'Ngày không hợp lệ';
    if (v.endsAt && !DAY.test(v.endsAt)) errors[at('endsAt')] = 'Ngày không hợp lệ';
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) errors[at('endsAt')] = 'Ngày kết thúc phải sau ngày bắt đầu';
    return [{ enabled: raw.enabled, ...Object.fromEntries(SLIDE_TEXT.filter((k) => v[k]).map((k) => [k, v[k]])) }];
  });
  return JSON.stringify(out.slice(0, MAX_HERO_SLIDES));
}
```
(`readHeroSlides` goes before `settingsToForm`; `writeHeroSlides` after `isHttps`/`DAY`.) Wire: `heroSlides: readHeroSlides(s)` in `settingsToForm`; `settings[HERO_SLIDES_KEY] = writeHeroSlides(f.heroSlides, errors);` in `formToSettings`. Note the round-trip test expects `{ enabled: false, title, ctaLabel, ctaHref }` — keys in that order: `enabled` first, then SLIDE_TEXT order; `toEqual` ignores key order anyway.

- [ ] **Step 3: `HeroSlideFields.tsx`**

```tsx
'use client';

import type { HeroSlideForm } from '../../../lib/adminSettings';
import type { FieldErrors } from '../../../lib/forms';
import { HERO_LIMITS } from '../../../lib/heroSlides';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

type Props = {
  index: number; count: number; value: HeroSlideForm; errors: FieldErrors;
  onChange: (next: HeroSlideForm) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
};

const small = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-sm font-bold disabled:opacity-40';

// One hero slide: same fields as the old single hero plus on/off and dates. Names mirror the error
// keys (heroSlides.0.title → heroSlides-0-title).
export function HeroSlideFields({ index, count, value, errors, onChange, onMove, onRemove }: Props) {
  const set = <K extends keyof HeroSlideForm>(key: K, v: HeroSlideForm[K]) => onChange({ ...value, [key]: v });
  const p = `heroSlides-${index}`;
  const err = (k: string) => errors[`heroSlides.${index}.${k}`];
  const field = (key: Exclude<keyof HeroSlideForm, 'enabled' | 'image'>, label: string, extra: { placeholder?: string; maxLength?: number; type?: string } = {}) => (
    <TextField name={`${p}-${key}`} label={label} value={value[key]} error={err(key)} {...extra} onChange={(e) => set(key, e.target.value)} />
  );
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
      <legend className="px-1 font-bold text-ink">Slide {index + 1}{index === 0 ? ' (hiện đầu tiên)' : ''}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-3 font-bold text-ink">
          <input type="checkbox" checked={value.enabled} onChange={(e) => set('enabled', e.target.checked)} className="size-5 accent-[var(--brand-teal-ink)]" />
          Đang hiển thị
        </label>
        <div className="flex gap-2">
          <button type="button" className={small} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Đưa slide ${index + 1} lên`}>↑</button>
          <button type="button" className={small} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Đưa slide ${index + 1} xuống`}>↓</button>
          <button type="button" className={`${small} text-pink-ink`} onClick={onRemove} aria-label={`Xoá slide ${index + 1}`}>Xoá</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {field('badge', 'Nhãn nhỏ', { placeholder: '♥ Yêu thương & chăm sóc', maxLength: HERO_LIMITS.badge })}
        {field('title', 'Tiêu đề dòng 1', { maxLength: HERO_LIMITS.title })}
        {field('accent', 'Tiêu đề dòng 2 (màu xanh)', { maxLength: HERO_LIMITS.accent })}
        {field('subtitle', 'Mô tả', { maxLength: HERO_LIMITS.subtitle })}
        {field('ctaLabel', 'Nút chính', { placeholder: 'Mua ngay', maxLength: HERO_LIMITS.label })}
        {field('ctaHref', 'Link nút chính', { placeholder: '/san-pham' })}
        {field('cta2Label', 'Nút phụ (tuỳ chọn)', { maxLength: HERO_LIMITS.label })}
        {field('cta2Href', 'Link nút phụ', { placeholder: '/tu-van-bao-gia' })}
        <div className="grid grid-cols-2 gap-3">
          {field('startsAt', 'Từ ngày', { type: 'date' })}
          {field('endsAt', 'Đến ngày', { type: 'date' })}
        </div>
      </div>
      <ImageField id={`${p}-image`} label="Ảnh" value={value.image} error={err('image')} onChange={(v) => set('image', v)} />
    </fieldset>
  );
}
```

- [ ] **Step 4: `SettingsEditor.tsx`** — replace the "Hero trang chủ" `<Section>` and the `hero(...)` helper with:
```tsx
      <Section title="Slide hero" hint={`Tối đa ${MAX_HERO_SLIDES} slide, tự chuyển mỗi 6 giây. Slide tắt, chưa tới ngày hoặc hết hạn sẽ tự ẩn; không còn slide nào thì trang chủ hiện hero mặc định.`}>
        {form.heroSlides.map((slide, i) => (
          <HeroSlideFields key={i} index={i} count={form.heroSlides.length} value={slide} errors={errors}
            onChange={(next) => update({ ...form, heroSlides: form.heroSlides.map((s, j) => (j === i ? next : s)) })}
            onMove={(dir) => { const ids = moveInSiblings(form.heroSlides.map((_, j) => String(j)), String(i), dir); if (ids) update({ ...form, heroSlides: ids.map((j) => form.heroSlides[Number(j)]) }); }}
            onRemove={() => update({ ...form, heroSlides: form.heroSlides.filter((_, j) => j !== i) })} />
        ))}
        {form.heroSlides.length < MAX_HERO_SLIDES && (
          <button type="button" onClick={() => update({ ...form, heroSlides: [...form.heroSlides, { ...EMPTY_HERO_SLIDE }] })}
            className="min-h-12 self-start rounded-full border-2 border-brand-ink px-5 font-bold text-brand-ink">+ Thêm slide</button>
        )}
      </Section>
```
Imports: `HeroSlideFields`, `EMPTY_HERO_SLIDE`, `MAX_HERO_SLIDES` (from `lib/heroSlides`), `moveInSiblings` (from `lib/adminCategories`). Remove the now-unused `ImageField` import only if nothing else uses it (category circles / promos import their own).

- [ ] **Step 5: Run** — `npx vitest run test/adminSettings.test.ts` PASS; `npm run lint && npm run typecheck && npm test`.

---

### Task 3: Homepage — `HeroSlideView`, `Hero`, `HeroSlider`

**Files:**
- Modify: `frontend-petshop/components/home/Hero.tsx` (split out `HeroSlideView`)
- Create: `frontend-petshop/components/home/HeroSlider.tsx`
- Create: `frontend-petshop/lib/useMediaState.ts` (two `useSyncExternalStore` hooks)
- Modify: `frontend-petshop/app/page.tsx` (use `parseHeroSlides`, drop `heroFrom` / `HERO_KEYS`)

**Interfaces:**
- Consumes: `HeroContent`, `parseHeroSlides`, `nextIndex`, `HERO_SLIDES_KEY`, `LEGACY_HERO_KEYS` (Task 1).
- Produces: `HeroSlideView({ content, headingId, level, priority })`, `HeroSlider({ slides })`, `usePrefersReducedMotion()`, `useDocumentHidden()`.

- [ ] **Step 1: `Hero.tsx`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import type { HeroContent } from '../../lib/heroSlides';

export type { HeroContent };

type ViewProps = { content: HeroContent; headingId: string; level: 'h1' | 'h2'; priority: boolean };

// One hero layout (copy left, photo over yellow + coral panels right), shared by the static hero and
// every slider slide. Only slide 1 is the page's <h1> and its photo the LCP element (high priority);
// later slides use <h2> at the same size and lazy images.
export function HeroSlideView({ content, headingId, level: Heading, priority }: ViewProps) {
  return (
    <div className="grid lg:min-h-[420px] lg:grid-cols-2">
      {/* …the current text column markup, with <Heading id={headingId} …> instead of <h1 id="hero-title" …>… */}
      {/* …the current art column, with the <Image> getting {...(priority ? { fetchPriority: 'high' } : { loading: 'lazy' })}… */}
    </div>
  );
}

// Static hero (one slide): same markup inside the labelled section.
export function Hero({ content }: { content: HeroContent }) {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-mint">
      <HeroSlideView content={content} headingId="hero-title" level="h1" priority />
    </section>
  );
}
```
Move the two existing column `<div>`s verbatim into `HeroSlideView` (keep every class, comment and the `aria-hidden` on the art column); only the heading element / id and the image priority props change. `bg-mint` stays on the outer section (and on each slide in the slider so the fade never shows through).

- [ ] **Step 2: `lib/useMediaState.ts`**

```ts
import { useSyncExternalStore } from 'react';

// Browser state read without setState-in-effect: React subscribes and re-renders on change. The
// server snapshot is the "nothing special" value; the client corrects it right after hydration.
function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  };
}
const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = subscribeMedia(REDUCED);

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

export function useDocumentHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}
```

- [ ] **Step 3: `HeroSlider.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { nextIndex, type HeroContent } from '../../lib/heroSlides';
import { useDocumentHidden, usePrefersReducedMotion } from '../../lib/useMediaState';
import { HeroSlideView } from './Hero';

const AUTOPLAY_MS = 6000;
const SWIPE_PX = 40;
const ctrl = 'grid size-11 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-card hover:bg-surface';

// Accessible auto-playing hero (WAI-ARIA carousel pattern). Every slide is in the server HTML,
// stacked in one grid cell so the hero is as tall as its tallest slide and switching never shifts
// the layout; hidden slides are inert. Autoplay stops while hovered, while focus is inside, while
// the tab is hidden, after ⏸, and by default when the visitor prefers reduced motion.
export function HeroSlider({ slides }: { slides: HeroContent[] }) {
  const n = slides.length;
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null); // null = default (play unless reduced motion)
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const hidden = useDocumentHidden();
  const startX = useRef<number | null>(null);
  const autoplay = choice ?? !reduced;
  const running = autoplay && !hovered && !focused && !hidden;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setIndex((i) => nextIndex(i, n, 1)), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [running, n]);

  const go = (dir: -1 | 1) => setIndex((i) => nextIndex(i, n, dir));
  const onPointerDown = (e: PointerEvent) => { startX.current = e.clientX; };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  return (
    <section aria-roledescription="carousel" aria-label="Nổi bật" className="relative overflow-hidden bg-mint touch-pan-y"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="grid" aria-live={running ? 'off' : 'polite'}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${n}`} inert={!active} aria-hidden={!active}
              className={`[grid-area:1/1] bg-mint transition-opacity duration-300 motion-reduce:transition-none ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <HeroSlideView content={s} headingId={`hero-title-${i}`} level={i === 0 ? 'h1' : 'h2'} priority={i === 0} />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 px-4">
        <button type="button" className={ctrl} onClick={() => go(-1)} aria-label="Slide trước">‹</button>
        <ol className="hidden items-center sm:flex">
          {slides.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}: ${s.title}`} aria-current={i === index ? 'true' : undefined}
                className="grid size-11 place-items-center">
                <span aria-hidden="true" className={`block size-2.5 rounded-full ${i === index ? 'bg-brand-ink' : 'bg-ink/30'}`} />
              </button>
            </li>
          ))}
        </ol>
        <span className="min-w-12 rounded-full bg-surface/90 px-2 py-1 text-center text-sm font-bold tabular-nums sm:hidden">{index + 1} / {n}</span>
        <button type="button" className={ctrl} onClick={() => setChoice(!autoplay)} aria-pressed={!autoplay}
          aria-label={autoplay ? 'Dừng tự chuyển slide' : 'Tự chuyển slide'}>{autoplay ? '⏸' : '▶'}</button>
        <button type="button" className={ctrl} onClick={() => go(1)} aria-label="Slide sau">›</button>
      </div>
    </section>
  );
}
```
Check against lint: no setState in effect bodies (only in the interval callback); `react-hooks` rules happy. If the controls overlap the hero copy on phones, add bottom padding to the slide text column inside the slider only (pass `className` to `HeroSlideView`'s text column: `pb-16`) — verify in the browser step.

- [ ] **Step 4: `app/page.tsx`** — remove `heroFrom`, `HERO_KEYS`, `isSafeHref`/`imageSrc` imports if unused; fetch `[...LEGACY_HERO_KEYS, HERO_SLIDES_KEY, ...PROMO_KEYS, …]`; then:
```tsx
  const heroSlides = parseHeroSlides(settings);
  …
      {heroSlides.length > 1 ? <HeroSlider slides={heroSlides} /> : <Hero content={heroSlides[0]} />}
```

- [ ] **Step 5: Verify** — `npm run lint && npm run typecheck && npm test`; build; with the local DB having no `homepage_hero_slides` the homepage looks exactly as before (curl: 1 `<h1>`, same title). Then save 3 slides via the admin API (scratchpad script, cleaned up afterwards) and check:
  - curl: 3 titles in HTML, exactly one `<h1>`, `fetchpriority="high"` once.
  - CDP at 1280 / 390 / 320 / 195: no horizontal scroll; autoplay advances after ~6 s; hover / focus stops it; ⏸ stops it; ← → work; swipe (pointer events) works; Tab never reaches a hidden slide's links; reduced motion (`Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`) → no autoplay; tap targets ≥ 44px; controls do not cover the buttons.
  - Lighthouse mobile on `/`: CLS ≤ 0.1; LCP compared with the current build.

---

### Task 4: Docs and commit

- [ ] PROGRESS entry (hero slider). No ADR needed (no schema / API / URL change; a settings-driven pattern already covered by ADR-014).
- [ ] Remove any test slides created during verification (restore the local setting to what it was).
- [ ] Full frontend `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Propose the commit, wait for "ok": `add homepage hero slider with admin slides`.
