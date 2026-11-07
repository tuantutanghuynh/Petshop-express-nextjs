import dotenv from 'dotenv';
dotenv.config();

// Single gateway between `.env` and the rest of the backend. Other modules import named
// values from here instead of reading `process.env` directly, so every secret the app needs
// is visible in one list and a missing variable surfaces in one place.
//
// Only `port` has a fallback, and deliberately so: a wrong port is harmless, whereas
// defaulting a database URL or a JWT secret would let the server boot with a silently
// insecure configuration instead of failing loudly. None of these values may be committed —
// `.env` is gitignored and `.env.example` documents the shape with dummy values.

export interface EnvConfig {
  port: string | number;
  databaseUrl: string | undefined;
  dbPoolMax: number;
  jwtAccessSecret: string | undefined;
  cloudinary: {
    cloudName: string | undefined;
    apiKey: string | undefined;
    apiSecret: string | undefined;
  };
}

export const port: string | number = process.env.PORT || 4000;
export const databaseUrl: string | undefined = process.env.DATABASE_URL;
// Connections one backend process may open. With several instances (or a hosted Postgres with a
// low connection cap) the total is instances × this, so it is set per deployment.
export const dbPoolMax: number = Number(process.env.DB_POOL_MAX) || 10;
export const jwtAccessSecret: string | undefined = process.env.JWT_ACCESS_SECRET;
// Shared with the Next.js server only; lets its server-side requests skip the API rate limiter.
export const internalApiSecret: string | undefined = process.env.INTERNAL_API_SECRET || undefined;
export const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

// Unset NODE_ENV counts as development, as in Express: `npm run dev` does not set it, while the
// test scripts set "test" and the hosting platform sets "production".
const nodeEnv = process.env.NODE_ENV || 'development';
export const isProduction: boolean = nodeEnv === 'production';
export const isDevelopment: boolean = nodeEnv === 'development';

// Lowest log level written (pino: trace, debug, info, warn, error, fatal).
export const logLevel: string = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Origin of the storefront, for links the backend writes into emails (password reset). Development
// defaults to the local Next.js server; production must set it (assertProductionConfig).
export const siteUrl: string = (process.env.PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Outgoing email over SMTP (Gmail with an app password works before the shop has a domain; any
// provider's SMTP later). Without a host, development prints emails to the console instead.
export const smtp = {
  host: process.env.SMTP_HOST || undefined,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER || undefined,
  pass: process.env.SMTP_PASS || undefined,
  from: process.env.MAIL_FROM || undefined,
};

const PRODUCTION_REQUIRED = [
  // Emails (password reset, newsletter) and the links inside them.
  'PUBLIC_SITE_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM',
  // Without these the server boots and then fails per request: no database; logins answer 500;
  // every visitor relayed by Next.js shares one rate-limit bucket (429 within minutes); CORS
  // allows only localhost; uploads answer 500.
  'DATABASE_URL', 'JWT_ACCESS_SECRET', 'INTERNAL_API_SECRET', 'FRONTEND_URLS',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
] as const;

// Called before the server starts listening (bin/www.ts). In production a missing setting would
// fail quietly (see the list above), so the server refuses to start and names what is missing —
// names only, never values. `env` is a parameter so tests need not touch process.env.
export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const missing = PRODUCTION_REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Thiếu biến môi trường cho production: ${missing.join(', ')}`);
}

const config: EnvConfig = {
  port,
  databaseUrl,
  dbPoolMax,
  jwtAccessSecret,
  cloudinary,
};

export default config;
