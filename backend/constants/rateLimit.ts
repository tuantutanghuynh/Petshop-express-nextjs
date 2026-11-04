// Global API limiter (app.ts): requests allowed per window, per bucket (see middlewares/rateLimitKeys.ts).

export const API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Customers, visitors and any token that does not verify.
export const API_RATE_LIMIT = 100;

// A verified admin token (ADR-019). Entering products costs ~3 requests to open the form plus one
// per save and per changed variant or photo, so 100 ran out within minutes. 1 000 per 15 minutes
// (about one per second) covers bulk entry and still caps what a leaked admin token can pull.
export const ADMIN_API_RATE_LIMIT = 1000;
