import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from '../config/env';

// Production must be able to email password reset links, or "forgot password" silently does
// nothing; and it must have the settings without which the server boots but fails quietly (see
// the second describe). A missing setting stops the server at start-up, naming the variables but
// never printing their values. Outside production nothing is required.
const FULL = {
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://shop.example',
  SMTP_HOST: 'smtp.example',
  SMTP_USER: 'shop@example.com',
  SMTP_PASS: 's3cr3t-value',
  MAIL_FROM: 'Siêu thị của chó mèo <shop@example.com>',
  DATABASE_URL: 'postgresql://u:p@db.example:6543/postgres',
  JWT_ACCESS_SECRET: 'jwt-secret-value',
  INTERNAL_API_SECRET: 'internal-secret-value',
  FRONTEND_URLS: 'https://shop.example',
  CLOUDINARY_CLOUD_NAME: 'shop',
  CLOUDINARY_API_KEY: '123',
  CLOUDINARY_API_SECRET: 'cloudinary-secret-value',
};

describe('assertProductionConfig', () => {
  it('names every missing variable in production', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'production' })).toThrow(
      /PUBLIC_SITE_URL.*SMTP_HOST.*SMTP_USER.*SMTP_PASS.*MAIL_FROM/,
    );
  });

  it('never prints the values of the variables that are set', () => {
    const { SMTP_HOST: _host, ...missingHost } = FULL;
    expect(() => assertProductionConfig(missingHost)).toThrow(/SMTP_HOST/);
    try {
      assertProductionConfig(missingHost);
    } catch (err) {
      expect(String(err)).not.toContain('s3cr3t-value');
    }
  });

  it('accepts a complete production configuration', () => {
    expect(() => assertProductionConfig(FULL)).not.toThrow();
  });

  it('requires nothing outside production', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});

// Each of these lets the server start and then fail per request: without the internal secret every
// visitor relayed by Next.js shares ONE rate-limit bucket (the site answers 429 within minutes);
// without the JWT secret logins answer 500; without FRONTEND_URLS CORS allows only localhost; without
// Cloudinary every upload answers 500.
describe('assertProductionConfig — settings that fail quietly', () => {
  it.each(['DATABASE_URL', 'JWT_ACCESS_SECRET', 'INTERNAL_API_SECRET', 'FRONTEND_URLS', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])(
    'refuses to start without %s',
    (name) => {
      const env: NodeJS.ProcessEnv = { ...FULL };
      delete env[name];
      expect(() => assertProductionConfig(env)).toThrow(new RegExp(name));
    },
  );
});
