'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, validateForgotPassword, type FieldErrors } from '../../lib/forms';
import { FormAlert } from '../ui/FormAlert';
import { TextField } from '../ui/TextField';

// The answer is the same whether or not the address has an account (the backend never says), so
// this page cannot be used to find out who is a customer.
export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const values = { email: String(new FormData(formEl).get('email') ?? '') };
    const clientErrors = validateForgotPassword(values);
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return focusFirstError(formEl, clientErrors);

    setSubmitting(true);
    const res = await bffFetch('/api/auth/forgot-password', { method: 'POST', body: values });
    setSubmitting(false);
    if (res.ok) return setSent(true);
    if (res.error.code === 'VALIDATION_ERROR') {
      const serverErrors = fieldErrors(res.error.details);
      setErrors(serverErrors);
      focusFirstError(formEl, serverErrors);
    } else setAlert(res.error.message ?? 'Chưa gửi được, vui lòng thử lại.');
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-panel bg-mint p-5 text-brand-deep">
        <p className="font-bold">Nếu email này có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.</p>
        <p className="text-sm">Link có hiệu lực 60 phút. Không thấy thư? Kiểm tra cả mục Thư rác / Quảng cáo.</p>
        <Link href="/dang-nhap" className="inline-flex min-h-11 items-center self-start font-bold text-brand-ink underline">Về trang đăng nhập</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={alert} />
      <TextField name="email" label="Email đã đăng ký" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" required error={errors.email} />
      <button type="submit" disabled={submitting} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60">
        {submitting ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
      </button>
      <p className="text-center text-sm">
        Nhớ ra mật khẩu? <Link href="/dang-nhap" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Đăng nhập</Link>
      </p>
    </form>
  );
}
