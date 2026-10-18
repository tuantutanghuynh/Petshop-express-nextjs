import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import type { CorsOptions } from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import routes from './routes';
import notFound from './middlewares/notFound';
import errorHandler from './middlewares/errorHandler';
import { apiRateLimitKey, isServerRenderRequest } from './middlewares/rateLimitKeys';

// Assembles the Express application: security layers, body parsing, the API routes and the
// error handling chain, in that order. Middleware order is the whole point of this file —
// each block below runs on every request in the order it is registered, and several of the
// bugs this project has already hit came from registering something in the wrong position.

const app = express();

// Tells Express to trust the reverse proxy in front of the app (Render, Vercel) so that
// `req.ip` is the real client IP taken from `X-Forwarded-For` instead of the proxy's own
// address. Without it every request in production looks like it comes from a single IP, so
// the rate limiters below would count all users into one shared bucket and one busy visitor
// would lock everybody else out.
app.set('trust proxy', 1);

// Gzip nén dung lượng API
app.use(compression());

// Sets the standard security headers (HSTS, X-Frame-Options, and friends). The default
// cross-origin resource policy is relaxed to `cross-origin` because the frontend runs on a
// different origin and would otherwise be blocked from loading files served from `/uploads`.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Restricts which origins may call the API, read from `FRONTEND_URLS` as a comma-separated
// list. Defaults to http://localhost:3000 (frontend-petshop). Requests with no Origin
// header — curl, Postman, server-to-server — are allowed through.
const allowedOrigins = (process.env.FRONTEND_URLS || 'http://localhost:3000').split(',').map((o) => o.trim());

// Optional regex for Vercel preview deployments, e.g.
//   FRONTEND_ORIGIN_PATTERN=^https://tupetshop-[a-z0-9-]+-<team-slug>\.vercel\.app$
// It used to accept every origin ending in ".vercel.app". Anyone can host a site there, and with
// `credentials: true` such a site could call the API from a logged-in admin's browser and read
// the responses. A pattern is never airtight on a shared domain: even one ending in your team slug
// can be matched by a stranger's project NAMED "tupetshop-x-<team-slug>", whose production domain
// is exactly that. Prefer listing exact URLs in FRONTEND_URLS (or a custom domain); use the pattern
// only for short-lived preview testing. Unset = previews are not allowed.
const previewPattern = process.env.FRONTEND_ORIGIN_PATTERN ? new RegExp(process.env.FRONTEND_ORIGIN_PATTERN) : null;

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // No Origin header: curl, Postman, server-to-server (including Next.js SSR). CORS is a browser
    // mechanism and does not apply to them.
    if (!origin || allowedOrigins.includes(origin) || previewPattern?.test(origin)) {
      return callback(null, true);
    }
    // `false`, not an Error: the request itself is answered normally but without CORS headers, so
    // the browser blocks the page from reading it. Passing an Error turned every such request into
    // a 500 from errorHandler.
    callback(null, false);
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Baseline throttle of 100 requests per 15 minutes across the whole API, as a blunt protection
// against scraping and runaway clients. The bucket is the logged-in user when the request carries
// a valid access token and the visitor IP otherwise; page renders by our Next.js server are exempt — see
// middlewares/rateLimitKeys.ts for why counting by IP alone blocked real visitors. Sensitive
// endpoints do not rely on this number alone: `/contact` and `/quote-requests` mount their own
// stricter per-IP limiters in their route files, which run in addition to this one.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiRateLimitKey,
  skip: isServerRenderRequest,
  message: 'Too many requests, please try again after 15 minutes',
});

app.use('/api/', apiLimiter);

// JSON endpoints are not pages: if a crawler ever reaches the API directly (a link in a log, a
// public API domain) it must not index raw responses next to the real storefront pages.
app.use('/api', (_req: Request, res: Response, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Request logging plus body parsing. The 10MB body cap is far above the usual JSON payload
// because blog content comes from a rich text editor that can inline images as base64 data
// URIs; the Express default of 100KB rejected those saves with an opaque 500.
app.use(logger('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Liveness probe for the hosting platform. It answers before any authentication so an
// uptime check never needs credentials.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Serves images uploaded before the move to Cloudinary. It has to stay above `notFound`,
// otherwise the catch-all answers first and every one of these files 404s — which is exactly
// what happened once and made all uploaded images disappear from the site.
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// The API itself, then the two closing handlers: `notFound` turns any unmatched URL into a
// 404 ApiError, and `errorHandler` formats every error into the standard envelope. Both must
// remain last and in this order — anything registered after `errorHandler` never runs.
app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
