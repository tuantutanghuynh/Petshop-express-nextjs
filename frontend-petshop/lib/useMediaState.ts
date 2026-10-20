import { useSyncExternalStore } from 'react';

// Browser state read without setState-in-effect: React subscribes and re-renders on change. The
// server snapshot is the "nothing special" value; the client corrects it right after hydration.
function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  };
}
const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeReduced = subscribeMedia(REDUCED);

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

export function useDocumentHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
}
