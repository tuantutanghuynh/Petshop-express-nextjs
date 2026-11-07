'use client';

import { useState } from 'react';
import { bffFetch } from '../../lib/bffClient';

type State = 'idle' | 'working' | 'done' | 'invalid' | 'error';

// A click, not the page load, unsubscribes: mail scanners open links in emails on their own and
// must not unsubscribe people.
export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'idle' : 'invalid');

  async function onClick() {
    setState('working');
    const res = await bffFetch('/api/newsletter/unsubscribe', { method: 'POST', body: { token } });
    setState(res.ok ? 'done' : res.error.code === 'INVALID_TOKEN' || res.error.code === 'VALIDATION_ERROR' ? 'invalid' : 'error');
  }

  if (state === 'done') return <p role="status" className="rounded-panel bg-mint p-5 font-bold text-brand-deep">Bạn đã huỷ đăng ký. Chúng tôi sẽ không gửi thêm email nhận tin.</p>;
  if (state === 'invalid') return <p role="alert" className="rounded-panel bg-pink-bg p-5 font-bold text-pink-ink">Link huỷ đăng ký không hợp lệ.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p>Bạn sẽ không nhận email mẹo chăm sóc và ưu đãi nữa.</p>
      {state === 'error' && <p role="alert" className="text-sm font-bold text-pink-ink">Chưa huỷ được, vui lòng thử lại.</p>}
      <button type="button" onClick={() => void onClick()} disabled={state === 'working'} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60 md:w-auto md:self-start">
        {state === 'working' ? 'Đang huỷ…' : 'Huỷ đăng ký'}
      </button>
    </div>
  );
}
