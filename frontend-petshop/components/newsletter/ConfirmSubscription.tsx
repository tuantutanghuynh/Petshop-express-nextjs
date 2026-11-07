'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { bffFetch } from '../../lib/bffClient';

type State = 'working' | 'done' | 'invalid' | 'error';

const isBadLink = (code: string) => code === 'INVALID_TOKEN' || code === 'VALIDATION_ERROR';

// Confirms on arrival: opening the emailed link is the confirmation. The ref keeps React's
// development double-run from spending the single-use token twice.
export function ConfirmSubscription({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'working' : 'invalid');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    bffFetch('/api/newsletter/confirm', { method: 'POST', body: { token } }).then((res) => {
      setState(res.ok ? 'done' : isBadLink(res.error.code) ? 'invalid' : 'error');
    });
  }, [token]);

  if (state === 'working') return <p aria-busy="true" className="text-muted">Đang xác nhận…</p>;
  if (state === 'done') {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-panel bg-mint p-5 text-brand-deep">
        <p className="font-bold">Đăng ký thành công! Bạn sẽ nhận mẹo chăm sóc và ưu đãi qua email.</p>
        <Link href="/" className="inline-flex min-h-11 items-center self-start font-bold text-brand-ink underline">Về trang chủ</Link>
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-panel bg-pink-bg p-5 text-pink-ink">
      <p className="font-bold">{state === 'invalid' ? 'Link không hợp lệ hoặc đã hết hạn (48 giờ).' : 'Chưa xác nhận được, vui lòng tải lại trang.'}</p>
      {state === 'invalid' && <p className="text-sm">Bạn có thể đăng ký lại bằng ô email ở cuối trang.</p>}
    </div>
  );
}
