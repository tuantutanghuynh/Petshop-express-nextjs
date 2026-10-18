import crypto from 'crypto';
import net from 'net';
import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { internalApiSecret } from '../config/env';
import { verifyAccessToken } from '../services/jwt.service';

// Decides whose bucket a request is counted in by the global API rate limiter, and which
// requests are exempt. Counting purely by IP was wrong twice over:
//   - the Next.js server renders every storefront page from ONE IP, so a few dozen page views
//     by different visitors would have locked the whole site out with 429;
//   - phones on 4G share carrier-NAT IPs with thousands of strangers, so one busy user would
//     block everyone else on the same mobile network (this matters for the future Flutter app).

// The limiter key: the user id when the request carries a VERIFIED access token, the client IP
// otherwise. Only a token that passes signature and expiry checks earns a per-user bucket; an
// unsigned, forged, expired or random token falls back to the IP. If any token string counted,
// sending a new garbage token per request would give an attacker unlimited fresh buckets.
// IPv6 addresses are grouped by /56 subnet (ipKeyGenerator) because one household or phone gets
// a whole range and could otherwise rotate addresses to dodge the limit.
export function apiRateLimitKey(req: Request): string {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const payload = verifyAccessToken(token);
      if (typeof payload.sub === 'string' && payload.sub) return `user:${payload.sub}`;
    } catch {
      // not a valid token: counted against the IP below, exactly like an anonymous request
    }
  }
  return ipBucket(req);
}

// The visitor's IP. Usually req.ip (the proxy hop is trusted in app.ts). When our Next.js server
// forwards a visitor's own request (BFF: login, cart, checkout), req.ip is the Next.js server, so it
// passes the visitor's address in X-Client-IP. That header is honoured ONLY alongside the correct
// X-Internal-Secret, and only if it parses as an IP: from anyone else it would let an attacker
// claim a fresh address on every request and never be limited.
export function clientIp(req: Request): string {
  const forwarded = req.get('X-Client-IP');
  if (forwarded && net.isIP(forwarded) && isTrustedServerRequest(req)) return forwarded;
  return req.ip ?? '';
}

// Per-IP bucket key; IPv6 grouped by /56 (see above).
export function ipBucket(req: Request): string {
  return `ip:${ipKeyGenerator(clientIp(req))}`;
}

// Exempt from the global limiter: page renders by our Next.js server (secret, no X-Client-IP). A
// render serves many visitors from one IP, so limiting it would throttle the whole storefront. A
// request that carries X-Client-IP is a visitor's own action relayed by the BFF and is counted
// like any other visitor request.
export function isServerRenderRequest(req: Request): boolean {
  return !req.get('X-Client-IP') && isTrustedServerRequest(req);
}

// True only for server-to-server calls from our own Next.js server, which sends
// `X-Internal-Secret: <INTERNAL_API_SECRET>`. Those requests are rendering pages for many
// different visitors, so limiting them by their single IP would throttle the whole storefront.
// The secret must never reach a browser (no NEXT_PUBLIC_ prefix on the Next.js side).
// An unset or empty secret matches nothing, so a missing config can never open the bypass, and the
// comparison is constant-time so the secret cannot be guessed byte by byte from response timing.
export function isTrustedServerRequest(req: Request): boolean {
  if (!internalApiSecret) return false;
  const sent = req.get('X-Internal-Secret');
  if (!sent) return false;
  const digest = (v: string) => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(digest(sent), digest(internalApiSecret));
}
