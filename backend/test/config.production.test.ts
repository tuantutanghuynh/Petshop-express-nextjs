import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from '../config/env';

// Production must be able to email password reset links, or "forgot password" silently does
// nothing. A missing setting stops the server at start-up, naming the variables but never printing
// their values. Outside production nothing is required: development prints the email instead.
const FULL = {
  NODE_ENV: 'production',
  PUBLIC_SITE_URL: 'https://shop.example',
  SMTP_HOST: 'smtp.example',
  SMTP_USER: 'shop@example.com',
  SMTP_PASS: 's3cr3t-value',
  MAIL_FROM: 'Siêu thị của chó mèo <shop@example.com>',
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
