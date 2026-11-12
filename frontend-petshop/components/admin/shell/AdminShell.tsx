'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { authFetch, clearTokens, getRefreshToken, getToken } from '../../../lib/adminAuth';
import { activeNavItem } from '../../../lib/adminNav';
import { BRAND_LOGO, LOGO_HORIZONTAL_WHITE_SIZE } from '../../../lib/brand';
import { SITE_NAME, SITE_TAGLINE } from '../../../lib/site';
import { AdminNavList } from './AdminNavList';

// Shared admin chrome (wireframe layout.js / wf.css .admin*): a dark 240px sidebar from 1024px, a ☰
// drawer below it, a sticky top bar with the page title, the signed-in email and "Đăng xuất". It is
// also the one auth gate: without a token every admin page goes to /admin/login, which itself is
// rendered bare. localStorage is read through useSyncExternalStore (no setState in an effect).
const noop = () => () => {};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasToken = useSyncExternalStore(noop, () => Boolean(getToken()), () => false);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [email, setEmail] = useState<string | null>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (isLogin || !hydrated) return;
    if (!hasToken) {
      router.replace('/admin/login');
      return;
    }
    let active = true;
    authFetch<{ email: string }>('/auth/me').then((res) => active && setEmail(res.data?.email ?? null));
    return () => {
      active = false;
    };
  }, [isLogin, hydrated, hasToken, router]);

  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  // Reviews waiting for moderation (ADR-027), shown next to "Đánh giá"; re-read on every page change
  // so it drops right after the admin works through the queue. A failure just shows no badge.
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (isLogin || !hydrated || !hasToken) return;
    let active = true;
    authFetch<{ pending: number }>('/reviews/admin/pending-count').then((res) => {
      if (active && res.data) setBadges({ '/admin/danh-gia': res.data.pending });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isLogin, hydrated, hasToken, pathname]);

  if (isLogin) return <>{children}</>;

  async function logout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await authFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    } catch {
      // A network error must not keep the admin signed in on this device: the tokens go anyway.
    }
    clearTokens();
    router.replace('/admin/login');
  }

  const title = activeNavItem(pathname)?.label ?? 'Quản trị';
  const brand = (
    // The one-colour white logo: the guide's version for dark backgrounds.
    <div className="mb-4 flex flex-col gap-1 px-3 text-white">
      <Image src={BRAND_LOGO.horizontalWhite} alt={`${SITE_NAME} – ${SITE_TAGLINE}`} width={LOGO_HORIZONTAL_WHITE_SIZE.width}
        height={LOGO_HORIZONTAL_WHITE_SIZE.height} unoptimized className="h-8 w-auto max-w-full self-start" />
      <span className="text-xs font-bold tracking-wide text-white/70 uppercase">Quản trị</span>
    </div>
  );

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-surface-alt lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto bg-ink px-3 py-4 lg:block">
        {brand}
        <nav aria-label="Quản trị"><AdminNavList pathname={pathname} badges={badges} /></nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4">
          <button type="button" aria-label="Mở menu quản trị" onClick={() => drawer.current?.showModal()}
            className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-mint lg:hidden">☰</button>
          <strong className="min-w-0 truncate text-ink">{title}</strong>
          <span className="ml-auto hidden max-w-[16rem] truncate text-sm text-muted sm:inline">{email ?? ''}</span>
          <button type="button" onClick={logout} className="ml-auto min-h-11 shrink-0 rounded-full sm:ml-0 border border-line px-4 text-sm font-bold text-ink hover:bg-mint">Đăng xuất</button>
        </header>
        <main id="main" className="p-4 md:p-6">{hasToken ? children : null}</main>
      </div>
      <dialog ref={drawer} aria-label="Menu quản trị" onClick={(e) => { if (e.target === e.currentTarget) drawer.current?.close(); }}
        className="m-0 h-dvh max-h-none w-[min(85vw,280px)] max-w-none bg-ink p-0 backdrop:bg-ink/60 lg:hidden">
        <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
          <div className="flex items-start justify-between">
            {brand}
            <button type="button" aria-label="Đóng menu" onClick={() => drawer.current?.close()} className="grid size-11 place-items-center rounded-full text-xl text-white">✕</button>
          </div>
          <nav aria-label="Quản trị"><AdminNavList pathname={pathname} badges={badges} /></nav>
        </div>
      </dialog>
    </div>
  );
}
