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
  jwtAccessSecret: string | undefined;
  jwtRefreshSecret: string | undefined;
  cloudinary: {
    cloudName: string | undefined;
    apiKey: string | undefined;
    apiSecret: string | undefined;
  };
}

export const port: string | number = process.env.PORT || 4000;
export const databaseUrl: string | undefined = process.env.DATABASE_URL;
export const jwtAccessSecret: string | undefined = process.env.JWT_ACCESS_SECRET;
export const jwtRefreshSecret: string | undefined = process.env.JWT_REFRESH_SALT;
// Shared with the Next.js server only; lets its server-side requests skip the API rate limiter.
export const internalApiSecret: string | undefined = process.env.INTERNAL_API_SECRET || undefined;
export const cloudinary = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

const config: EnvConfig = {
  port,
  databaseUrl,
  jwtAccessSecret,
  jwtRefreshSecret,
  cloudinary,
};

export default config;
