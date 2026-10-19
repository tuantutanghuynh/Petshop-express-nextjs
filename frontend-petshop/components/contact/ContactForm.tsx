'use client';

import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { focusFirstError, type FieldErrors } from '../../lib/forms';
import { FormAlert } from '../ui/FormAlert';
import { Honeypot } from '../ui/Honeypot';
import { TextField } from '../ui/TextField';

// Contact form (backend: name, email and message required; 5 messages / 15 min per visitor).
export function ContactForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const v = Object.fromEntries(['name', 'email', 'phone', 'subject', 'message', 'website_url'].map((k) => [k, String(f.get(k) ?? '').trim()]));
    const found: FieldErrors = {};
    if (!v.name) found.name = 'Nhập họ tên';
    if (!v.email) found.email = 'Nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) found.email = 'Email không hợp lệ';
    if (!v.message) found.message = 'Nhập nội dung';
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(formEl, found);
      return;
    }
    setSending(true);
    const res = await bffFetch('/api/contact', { method: 'POST', body: v });
    setSending(false);
    if (res.ok) setSent(true);
    else setAlert(res.status === 429 ? 'Bạn đã gửi quá nhiều tin nhắn, vui lòng thử lại sau 15 phút.' : res.error.message ?? 'Chưa gửi được, vui lòng thử lại.');
  }

  if (sent) return <p role="status" className="rounded-panel bg-mint p-5 font-bold text-brand-deep">✓ Shop đã nhận tin nhắn và sẽ trả lời sớm.</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="relative flex flex-col gap-4">
      <FormAlert message={alert} />
      <TextField name="name" label="Họ tên *" autoComplete="name" enterKeyHint="next" required error={errors.name} />
      <TextField name="email" label="Email *" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" required error={errors.email} />
      <TextField name="phone" label="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" />
      <TextField name="subject" label="Chủ đề" enterKeyHint="next" />
      <div className="flex flex-col gap-1">
        <label htmlFor="f-message" className="text-sm font-bold text-ink">Nội dung *</label>
        <textarea id="f-message" name="message" rows={5} maxLength={2000} aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? 'f-message-error' : undefined} className="rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-base text-ink" />
        {errors.message && <p id="f-message-error" className="text-sm text-pink-ink">{errors.message}</p>}
      </div>
      <Honeypot />
      <button type="submit" disabled={sending} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:w-auto md:self-start">
        {sending ? 'Đang gửi…' : 'Gửi tin nhắn'}
      </button>
    </form>
  );
}
