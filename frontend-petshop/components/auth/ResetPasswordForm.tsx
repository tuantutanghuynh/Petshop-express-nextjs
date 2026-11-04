'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, validateResetPassword, type FieldErrors } from '../../lib/forms';
import { TextField } from '../ui/TextField';

// Codes the backend uses for a link that cannot be used (wrong, already used or expired token).
const DEAD_LINK = ['INVALID_TOKEN', 'EXPIRED_TOKEN', 'INVALID_REQUEST'];

function DeadLink({ message }: { message: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
      <p>{message}</p>
      <Link href="/quen-mat-khau" className="inline-flex min-h-11 items-center self-start font-bold underline">Gửi lại link đặt lại mật khẩu</Link>
    </div>
  );
}

// New password for the account in the emailed link. On success every other session has been signed
// out by the backend, so the customer signs in again with the new password.
export function ResetPasswordForm({ email, token }: { email: string; token: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<{ message: string; dead: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!email || !token) return <DeadLink message="Link đặt lại mật khẩu không hợp lệ hoặc thiếu thông tin." />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const values = { newPassword: String(form.get('newPassword') ?? ''), confirmPassword: String(form.get('confirmPassword') ?? '') };
    const clientErrors = validateResetPassword(values);
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return focusFirstError(formEl, clientErrors);

    setSubmitting(true);
    const res = await bffFetch('/api/auth/reset-password', { method: 'POST', body: { email, token, newPassword: values.newPassword } });
    if (res.ok) {
      router.replace('/dang-nhap?da-doi-mat-khau=1');
      return;
    }
    setSubmitting(false);
    if (res.error.code === 'VALIDATION_ERROR') {
      const serverErrors = fieldErrors(res.error.details);
      setErrors(serverErrors);
      focusFirstError(formEl, serverErrors);
    } else if (DEAD_LINK.includes(res.error.code)) {
      setAlert({ message: 'Link đã hết hạn hoặc đã được dùng. Hãy yêu cầu link mới.', dead: true });
    } else {
      setAlert({ message: res.error.message ?? 'Chưa đặt lại được mật khẩu, vui lòng thử lại.', dead: false });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {alert && (alert.dead ? <DeadLink message={alert.message} /> : <p role="alert" className="rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">{alert.message}</p>)}
      <p className="text-sm text-muted">Tài khoản: <b className="break-all text-ink">{email}</b></p>
      <TextField name="newPassword" label="Mật khẩu mới" type="password" autoComplete="new-password" enterKeyHint="next" required error={errors.newPassword}
        hint="Ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt." />
      <TextField name="confirmPassword" label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" enterKeyHint="go" required error={errors.confirmPassword} />
      <button type="submit" disabled={submitting} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60">
        {submitting ? 'Đang lưu…' : 'Đặt mật khẩu mới'}
      </button>
    </form>
  );
}
