import { isIP } from 'node:net';

// The visitor's IP as seen by the platform in front of Next.js (Vercel sets X-Forwarded-For with
// the client first; X-Real-IP as a fallback). The BFF passes it to Express as X-Client-IP so login
// attempts are rate limited per visitor, not per Next.js server. Anything that does not parse as
// an IP is dropped — Express then falls back to the connection address.
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real && isIP(real)) return real;
  return undefined;
}
