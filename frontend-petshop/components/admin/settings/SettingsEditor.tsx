'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { authFetch, getToken } from '../../../lib/adminAuth';
import { ADMIN_SETTING_KEYS, EMPTY_HERO_SLIDE, formToSettings, settingsToForm, type SettingsForm } from '../../../lib/adminSettings';
import { moveInSiblings } from '../../../lib/adminCategories';
import { MAX_HERO_SLIDES } from '../../../lib/heroSlides';
import { buildCategoryTree, flattenTree, type CategoryNode } from '../../../lib/categoryTree';
import { MEGA_MENU_SLUGS } from '../../../lib/megaMenu';
import { CONTENT_PAGES } from '../../../lib/settings';
import { apiFetch } from '../../../lib/apiClient';
import { focusFirstError, type FieldErrors } from '../../../lib/forms';
import { BRAND_SLUG } from '../../../lib/site';
import type { Category, SiteSettings } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { TextField } from '../../ui/TextField';
import { CircleFields } from './CircleFields';
import { HeroSlideFields } from './HeroSlideFields';
import { MegaMenuFields } from './MegaMenuFields';
import { PromoFields } from './PromoFields';
import { Section } from './Section';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; form: SettingsForm; categories: CategoryNode[] };

// /admin/cau-hinh: everything the owner edits on the homepage and shop chrome, saved in one
// PATCH /settings, then the storefront cache is refreshed so the change shows immediately.
export function SettingsEditor() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace('/admin/login');
      return;
    }
    let active = true;
    Promise.all([
      apiFetch<SiteSettings>(`/settings?keys=${ADMIN_SETTING_KEYS.join(',')}`, { cache: 'no-store' }),
      apiFetch<Category[]>('/categories', { cache: 'no-store' }),
    ])
      .then(([settings, categories]) => {
        if (!active) return;
        setLoad({ state: 'ready', form: settingsToForm(settings.data), categories: buildCategoryTree(categories.data, BRAND_SLUG) });
      })
      .catch(() => active && setLoad({ state: 'error' }));
    return () => {
      active = false;
    };
  }, [router]);

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải cấu hình" className="h-60 animate-pulse rounded-panel bg-surface-alt" />;
  if (load.state === 'error') return <FormAlert message="Chưa tải được cấu hình. Tải lại trang để thử lại." />;

  const { form, categories } = load;
  const allCategories = flattenTree(categories);
  const update = (next: SettingsForm) => setLoad({ ...load, form: next });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const { settings, errors: found } = formToSettings(form);
    setErrors(found);
    setStatus(null);
    if (Object.keys(found).length > 0) {
      setStatus({ ok: false, text: 'Có ô chưa hợp lệ — xem các dòng báo đỏ.' });
      // Input names mirror the error keys with dots as dashes (promos.0.href → promos-0-href).
      requestAnimationFrame(() => focusFirstError(formEl, Object.fromEntries(Object.keys(found).map((k) => [k.replaceAll('.', '-'), '']))));
      return;
    }
    setSaving(true);
    const res = await authFetch<{ message: string }>('/settings', { method: 'PATCH', body: JSON.stringify({ settings }) });
    if (res.error) {
      setSaving(false);
      setStatus({ ok: false, text: res.error.message || 'Lưu không thành công' });
      return;
    }
    await revalidateStorefront(['settings']); // homepage, header, footer and content pages update right away
    setSaving(false);
    setStatus({ ok: true, text: 'Đã lưu. Trang chủ đã cập nhật.' });
  }

  const shop = (key: keyof Omit<SettingsForm['shop'], 'socialLinks'>, label: string, type = 'text') => (
    <TextField name={`shop-${key}`} label={label} type={type} value={form.shop[key]}
      onChange={(e) => update({ ...form, shop: { ...form.shop, [key]: e.target.value } })} />
  );
  const bank = (key: keyof SettingsForm['bank'], label: string) => (
    <TextField name={`bank-${key}`} label={label} value={form.bank[key]}
      onChange={(e) => update({ ...form, bank: { ...form.bank, [key]: e.target.value } })} />
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6 pb-28">
      <Section title="Thanh thông báo" hint="Dòng chữ trên cùng mọi trang (tối đa 3 dòng). Để trống cả 3 thì hiện các cam kết mặc định.">
        {form.announcements.map((line, i) => (
          <TextField key={i} name={`announce-${i}`} label={`Dòng ${i + 1}`} maxLength={120} value={line}
            onChange={(e) => update({ ...form, announcements: form.announcements.map((l, j) => (j === i ? e.target.value : l)) })} />
        ))}
      </Section>

      <Section title="Slide hero" hint={`Tối đa ${MAX_HERO_SLIDES} slide, tự chuyển mỗi 6 giây. Slide tắt, chưa tới ngày hoặc hết hạn sẽ tự ẩn; không còn slide nào thì trang chủ hiện hero mặc định.`}>
        {form.heroSlides.map((slide, i) => (
          <HeroSlideFields key={i} index={i} count={form.heroSlides.length} value={slide} errors={errors}
            onChange={(next) => update({ ...form, heroSlides: form.heroSlides.map((s, j) => (j === i ? next : s)) })}
            onMove={(dir) => {
              const order = moveInSiblings(form.heroSlides.map((_, j) => String(j)), String(i), dir);
              if (order) update({ ...form, heroSlides: order.map((j) => form.heroSlides[Number(j)]) });
            }}
            onRemove={() => update({ ...form, heroSlides: form.heroSlides.filter((_, j) => j !== i) })} />
        ))}
        {form.heroSlides.length < MAX_HERO_SLIDES && (
          <button type="button" onClick={() => update({ ...form, heroSlides: [...form.heroSlides, { ...EMPTY_HERO_SLIDE }] })}
            className="min-h-12 self-start rounded-full border-2 border-brand-ink px-5 font-bold text-brand-ink">+ Thêm slide</button>
        )}
      </Section>

      <Section title="Khuyến mãi (3 thẻ + 2 banner rộng)" hint="Màu cố định theo vị trí. Tắt hoặc ngoài khoảng ngày thì banner tự ẩn. Để trống hết một ô là xoá banner đó.">
        {form.promos.map((promo, i) => (
          <PromoFields key={i} index={i} value={promo} errors={errors}
            onChange={(next) => update({ ...form, promos: form.promos.map((p, j) => (j === i ? next : p)) })} />
        ))}
      </Section>

      <Section title="Vòng tròn “Mua theo bé cưng”" hint="Tối đa 8 vòng, theo thứ tự. Xoá hết tên và link của một vòng để bỏ vòng đó; để trống tất cả thì trang chủ hiện 6 vòng mặc định.">
        <CircleFields rows={form.circles} categories={allCategories} errors={errors} onChange={(circles) => update({ ...form, circles })} />
      </Section>

      <Section title="Menu Chó / Mèo" hint="Banner bên phải và thương hiệu nổi bật trong menu xổ xuống. Bấm vào thương hiệu sẽ lọc sản phẩm có ô “Thương hiệu” đúng tên này (không phân biệt hoa thường).">
        {MEGA_MENU_SLUGS.map((slug) => (
          <MegaMenuFields key={slug} slug={slug} label={categories.find((c) => c.slug === slug)?.name ?? slug} value={form.megaMenus[slug]} errors={errors}
            onChange={(next) => update({ ...form, megaMenus: { ...form.megaMenus, [slug]: next } })} />
        ))}
      </Section>

      <Section title="Thông tin cửa hàng" hint="Hiện ở header, footer, trang liên hệ và dữ liệu cấu trúc (Organization).">
        <div className="grid gap-3 md:grid-cols-2">
          {shop('phone', 'Hotline', 'tel')}
          {shop('zalo', 'Zalo')}
          {shop('email', 'Email', 'email')}
          {shop('hours', 'Giờ mở cửa')}
        </div>
        {shop('address', 'Địa chỉ')}
        <div className="flex flex-col gap-1">
          <label htmlFor="f-shop-socialLinks" className="text-sm font-bold text-ink">Facebook / Instagram / TikTok (mỗi dòng một link)</label>
          <textarea id="f-shop-socialLinks" name="shop-socialLinks" rows={3} value={form.shop.socialLinks}
            aria-invalid={errors['shop.socialLinks'] ? true : undefined} aria-describedby={errors['shop.socialLinks'] ? 'f-shop-socialLinks-error' : undefined}
            onChange={(e) => update({ ...form, shop: { ...form.shop, socialLinks: e.target.value } })}
            className="rounded-[var(--radius-sm)] border border-line p-3 text-base" />
          {errors['shop.socialLinks'] && <p id="f-shop-socialLinks-error" className="text-sm text-pink-ink">{errors['shop.socialLinks']}</p>}
        </div>
      </Section>

      <Section title="Tài khoản nhận chuyển khoản" hint="Đủ cả 3 ô thì khách mới chọn được thanh toán chuyển khoản. Thông tin này công khai.">
        <div className="grid gap-3 md:grid-cols-3">
          {bank('name', 'Ngân hàng')}
          {bank('account', 'Số tài khoản')}
          {bank('holder', 'Chủ tài khoản')}
        </div>
      </Section>

      <Section title="Trang nội dung" hint="Viết bằng Markdown (## tiêu đề, - gạch đầu dòng). Trang chưa có nội dung sẽ không hiện trên site. Chính sách phải đúng với cách shop làm thật (giữ hàng 24 giờ, phí ship báo khi xác nhận…).">
        {CONTENT_PAGES.map((page) => (
          <div key={page.key} className="flex flex-col gap-1">
            <label htmlFor={`f-${page.key}`} className="text-sm font-bold text-ink">{page.title} <span className="font-normal text-muted">({page.path})</span></label>
            <textarea id={`f-${page.key}`} name={page.key} rows={8} value={form.pages[page.key] ?? ''}
              onChange={(e) => update({ ...form, pages: { ...form.pages, [page.key]: e.target.value } })}
              className="rounded-[var(--radius-sm)] border border-line p-3 font-mono text-base" />
          </div>
        ))}
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p role="status" className={`text-sm ${status ? (status.ok ? 'text-brand-ink' : 'text-pink-ink') : 'text-muted'}`}>
            {status?.text ?? 'Thay đổi chỉ được lưu khi bấm “Lưu tất cả”.'}
          </p>
          <button type="submit" disabled={saving} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60">
            {saving ? 'Đang lưu…' : 'Lưu tất cả'}
          </button>
        </div>
      </div>
    </form>
  );
}
