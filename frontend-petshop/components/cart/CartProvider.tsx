'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { bffFetch, type BffError, type BffResponse } from '../../lib/bffClient';
import type { Cart } from '../../lib/types';

// One cart for the whole storefront tab: the header badge, the bottom tab bar, the add-to-cart
// button and the cart page all read it from here, so they never disagree. After every change the
// cart is reloaded from the backend (no optimistic guessing): prices, stock and warnings are the
// backend's to compute.

export type CartStatus = 'loading' | 'signedOut' | 'ready' | 'error';
type Result = { ok: true } | { ok: false; error: BffError };

type CartContextValue = {
  status: CartStatus;
  cart: Cart | null;
  reload: () => Promise<void>;
  addItem: (variantId: string, quantity: number) => Promise<Result>;
  updateQuantity: (lineId: string, quantity: number) => Promise<Result>;
  removeItem: (lineId: string) => Promise<Result>;
  logout: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

const isSignedOut = (code: string) => code === 'UNAUTHENTICATED' || code === 'ACCESS_EXPIRED';

// GET /api/cart answers a visitor without a session with 200 and data: null (not a 401).
function stateFrom(res: BffResponse<Cart | null>): { status: CartStatus; cart: Cart | null } {
  if (res.ok) return res.data ? { status: 'ready', cart: res.data } : { status: 'signedOut', cart: null };
  return { status: isSignedOut(res.error.code) ? 'signedOut' : 'error', cart: null };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CartStatus>('loading');
  const [cart, setCart] = useState<Cart | null>(null);

  const reload = useCallback(async () => {
    const next = stateFrom(await bffFetch<Cart | null>('/api/cart'));
    setCart(next.cart);
    setStatus(next.status);
  }, []);

  // First load after mount: the cookies are httpOnly, so the server-rendered HTML cannot know the
  // cart. State is set only when the response arrives, and ignored if the provider unmounted.
  useEffect(() => {
    let active = true;
    bffFetch<Cart | null>('/api/cart').then((res) => {
      if (!active) return;
      const next = stateFrom(res);
      setCart(next.cart);
      setStatus(next.status);
    });
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback(
    async (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<Result> => {
      const res = await bffFetch(path, { method, body });
      if (!res.ok && isSignedOut(res.error.code)) setStatus('signedOut');
      await reload();
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    },
    [reload],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      status,
      cart,
      reload,
      addItem: (variantId, quantity) => mutate('/api/cart/items', 'POST', { variantId, quantity }),
      updateQuantity: (lineId, quantity) => mutate(`/api/cart/items/${encodeURIComponent(lineId)}`, 'PATCH', { quantity }),
      removeItem: (lineId) => mutate(`/api/cart/items/${encodeURIComponent(lineId)}`, 'DELETE'),
      logout: async () => {
        await bffFetch('/api/auth/logout', { method: 'POST' });
        await reload();
      },
    }),
    [status, cart, reload, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
