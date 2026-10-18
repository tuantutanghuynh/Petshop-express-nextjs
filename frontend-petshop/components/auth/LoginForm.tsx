'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, validateLogin, type FieldErrors } from '../../lib/forms';
import { FormAlert } from '../ui/FormAlert';
import { TextField } from '../ui/TextField';

// Wrong email and wrong password get the same message: the backend answers both with one 401 so
// the form cannot be used to find out which emails have an account.
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
    const clientErrors = validateLogin(values);
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    const res = await bffFetch('/api/auth/login', { method: 'POST', body: values });
    if (res.ok) {
      router.replace(next);
      router.refresh();
      return;
    }
    setSubmitting(false);
    if (res.error.code === 'VALIDATION_ERROR') setErrors(fieldErrors(res.error.details));
    else setAlert(res.error.message ?? 'Đăng nhập không thành công, vui lòng thử lại.');
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={alert} />
      <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" required error={errors.email} />
      <TextField name="password" label="Mật khẩu" type="password" autoComplete="current-password" required error={errors.password} />
      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60"
      >
        {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      <p className="text-center text-sm">
        Chưa có tài khoản?{' '}
        <Link href={`/dang-ky?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Đăng ký</Link>
      </p>
    </form>
  );
}
