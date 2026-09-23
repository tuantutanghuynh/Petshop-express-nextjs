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
const allowedOrigins = (process.env.FRONTEND_URLS || 'http://localhost:3000').split(',');

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow no origin (Postman, S2S), specific allowed origins, or any Vercel domain
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} không được phép bởi CORS`));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Baseline throttle of 100 requests per 15 minutes per IP across the whole API, as a blunt
// protection against scraping and runaway clients. Sensitive endpoints do not rely on this
// number alone: `/auth/*` and `/contact` mount their own stricter limiters in their route
// files, which run in addition to this one.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

app.use('/api/', apiLimiter);

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
