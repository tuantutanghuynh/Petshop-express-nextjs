'use client';

import { useRef, useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../lib/forms';
import { NEWSLETTER_CONSENT_TEXT, validateNewsletter } from '../../lib/newsletter';
import type { Customer } from '../../lib/types';

// Footer signup (spec 2026-11-07). A signed-in customer's email is filled in on the first focus of
// the empty input — not on page load: the band is on every page and most visitors are not signed in.
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const askedMe = useRef(false);

  async function prefill() {
    if (askedMe.current || email) return;
    askedMe.current = true;
    const me = await bffFetch<Customer>('/api/auth/me');
    if (me.ok) setEmail((current) => current || me.data.email);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const clientErrors = validateNewsletter({ email });
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return focusFirstError(formEl, clientErrors);
    setSubmitting(true);
    const res = await bffFetch<{ message: string }>('/api/newsletter/subscribe', { method: 'POST', body: { email: email.trim() } });
    setSubmitting(false);
    if (res.ok) return setDone(res.data.message);
    if (res.error.code === 'VALIDATION_ERROR') {
      const serverErrors = fieldErrors(res.error.details);
      setErrors(serverErrors);
      focusFirstError(formEl, serverErrors);
    } else setAlert(res.error.message ?? 'Chưa đăng ký được, vui lòng thử lại.');
  }

  if (done) {
    return <p role="status" className="rounded-card bg-white/15 px-4 py-3 font-bold text-white">{done} Không thấy thư? Kiểm tra cả mục Thư rác / Quảng cáo.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-newsletter-email" className="sr-only">Email nhận tin</label>
        <input
          id="f-newsletter-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="send"
          placeholder="Email của bạn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => void prefill()}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'f-newsletter-email-error newsletter-consent' : 'newsletter-consent'}
          className="min-h-12 w-full min-w-0 rounded-full border-0 bg-white px-5 text-base text-ink md:w-72"
        />
        <button type="submit" disabled={submitting} className="min-h-12 w-full shrink-0 whitespace-nowrap rounded-full bg-yellow px-6 font-bold text-ink hover:brightness-95 active:brightness-90 disabled:opacity-60 md:w-auto">
          {submitting ? 'Đang gửi…' : 'Đăng ký'}
        </button>
      </div>
      {errors.email && <p id="f-newsletter-email-error" className="text-sm font-bold text-yellow">{errors.email}</p>}
      {alert && <p role="alert" className="text-sm font-bold text-yellow">{alert}</p>}
      <p id="newsletter-consent" className="text-sm text-white/85">{NEWSLETTER_CONSENT_TEXT}</p>
    </form>
  );
}
