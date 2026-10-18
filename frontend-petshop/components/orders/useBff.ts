'use client';

import { useEffect, useState } from 'react';
import { bffFetch, type BffError } from '../../lib/bffClient';

export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'error'; error: BffError }
  | { state: 'ready'; data: T };

// GET a BFF resource after mount. State changes only when the response arrives, and a response
// for an older `path` (or after unmount) is ignored.
export function useBffResource<T>(path: string): Loadable<T> {
  const [result, setResult] = useState<{ path: string; value: Loadable<T> } | null>(null);
  useEffect(() => {
    let active = true;
    bffFetch<T>(path).then((res) => {
      if (!active) return;
      let value: Loadable<T>;
      if (res.ok) value = { state: 'ready', data: res.data };
      else if (res.error.code === 'UNAUTHENTICATED' || res.error.code === 'ACCESS_EXPIRED') value = { state: 'signedOut' };
      else value = { state: 'error', error: res.error };
      setResult({ path, value });
    });
    return () => {
      active = false;
    };
  }, [path]);
  return result && result.path === path ? result.value : { state: 'loading' };
}
