// CSRF guard for BFF writes: the request's Origin header must be exactly our site. SameSite=Lax
// cookies already block most cross-site POSTs; this is the second lock. A missing Origin fails —
// browsers always send it on cross-origin and on same-origin POST/PATCH/DELETE fetches.
export function isSameOrigin(origin: string | null, siteUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}
