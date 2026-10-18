'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, validateRegister, type FieldErrors } from '../../lib/forms';
import { FormAlert } from '../ui/FormAlert';
import { TextField } from '../ui/TextField';

export function RegisterForm({ next }: { next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      fullName: String(form.get('fullName') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    };
    const clientErrors = validateRegister(values);
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    const res = await bffFetch('/api/auth/register', { method: 'POST', body: { ...values, fullName: values.fullName.trim() } });
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setSubmitting(false);
    if (res.error.code === 'VALIDATION_ERROR') setErrors(fieldErrors(res.error.details));
    else if (res.error.code === 'EMAIL_TAKEN') setErrors({ email: res.error.message ?? 'Email này đã được đăng ký' });
    else setAlert(res.error.message ?? 'Đăng ký không thành công, vui lòng thử lại.');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={alert} />
      <TextField name="fullName" label="Họ tên" autoComplete="name" required error={errors.fullName} />
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" required error={errors.email} />
      <TextField
        name="password"
        label="Mật khẩu"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt."
        error={errors.password}
      />
      <TextField name="confirmPassword" label="Nhập lại mật khẩu" type="password" autoComplete="new-password" required error={errors.confirmPassword} />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60"
      >
        {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
      </button>
      <p className="text-center text-sm">
        Đã có tài khoản?{' '}
        <Link href={`/dang-nhap?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Đăng nhập</Link>
      </p>
    </form>
  );
}
