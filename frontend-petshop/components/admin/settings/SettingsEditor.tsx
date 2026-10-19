'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { authFetch, getToken } from '../../../lib/adminAuth';
import { ADMIN_SETTING_KEYS, formToSettings, settingsToForm, type SettingsForm } from '../../../lib/adminSettings';
import { apiFetch } from '../../../lib/apiClient';
import { focusFirstError, type FieldErrors } from '../../../lib/forms';
import { BRAND_SLUG } from '../../../lib/site';
import type { Category, SiteSettings } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';
import { PromoFields } from './PromoFields';
import { Section } from './Section';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; form: SettingsForm; categories: Category[] };

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
        const root = categories.data.find((c) => c.parentId === null && c.slug === BRAND_SLUG);
        setLoad({ state: 'ready', form: settingsToForm(settings.data), categories: root ? categories.data.filter((c) => c.parentId === root.id) : [] });
      })
      .catch(() => active && setLoad({ state: 'error' }));
    return () => {
      active = false;
    };
  }, [router]);

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải cấu hình" className="h-60 animate-pulse rounded-panel bg-surface-alt" />;
  if (load.state === 'error') return <FormAlert message="Chưa tải được cấu hình. Tải lại trang để thử lại." />;

  const { form, categories } = load;
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
    await revalidateStorefront(['settings']); // homepage, header and footer show it right away
    setSaving(false);
    setStatus({ ok: true, text: 'Đã lưu. Trang chủ đã cập nhật.' });
  }

  const hero = (key: keyof SettingsForm['hero'], label: string, extra: { placeholder?: string; hint?: string } = {}) => (
    <TextField name={`hero-${key}`} label={label} value={form.hero[key]} error={errors[`hero.${key}`]} {...extra}
      onChange={(e) => update({ ...form, hero: { ...form.hero, [key]: e.target.value } })} />
  );
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

      <Section title="Hero trang chủ">
        <div className="grid gap-3 md:grid-cols-2">
          {hero('badge', 'Nhãn nhỏ', { placeholder: '♥ Yêu thương & chăm sóc' })}
          {hero('title', 'Tiêu đề dòng 1', { placeholder: 'Lựa chọn tốt nhất' })}
          {hero('accent', 'Tiêu đề dòng 2 (màu xanh)', { placeholder: 'cho bé cưng nhà bạn' })}
          {hero('subtitle', 'Mô tả')}
          {hero('ctaLabel', 'Nút chính', { placeholder: 'Mua ngay' })}
          {hero('ctaHref', 'Link nút chính', { placeholder: '/san-pham' })}
          {hero('cta2Label', 'Nút phụ', { placeholder: 'Nhờ tư vấn' })}
          {hero('cta2Href', 'Link nút phụ', { placeholder: '/tu-van-bao-gia' })}
        </div>
        <ImageField id="hero-image" label="Ảnh hero" value={form.hero.image} error={errors['hero.image']}
          onChange={(v) => update({ ...form, hero: { ...form.hero, image: v } })} />
      </Section>

      <Section title="Khuyến mãi (3 thẻ + 2 banner rộng)" hint="Màu cố định theo vị trí. Tắt hoặc ngoài khoảng ngày thì banner tự ẩn. Để trống hết một ô là xoá banner đó.">
        {form.promos.map((promo, i) => (
          <PromoFields key={i} index={i} value={promo} errors={errors}
            onChange={(next) => update({ ...form, promos: form.promos.map((p, j) => (j === i ? next : p)) })} />
        ))}
      </Section>

      <Section title="Ảnh danh mục (vòng tròn trang chủ)" hint={categories.length === 0 ? 'Chưa có danh mục nào của cửa hàng.' : undefined}>
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => (
            <ImageField key={c.id} id={`categoryImages-${c.slug}`} label={c.name} value={form.categoryImages[c.slug] ?? ''} error={errors[`categoryImages.${c.slug}`]}
              onChange={(v) => update({ ...form, categoryImages: { ...form.categoryImages, [c.slug]: v } })} />
          ))}
        </div>
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
