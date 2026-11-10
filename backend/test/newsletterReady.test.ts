import { describe, expect, it } from 'vitest';
import { assertNewsletterReady } from '../services/newsletterCampaign.service';

// Production must not accept a campaign it has no way to send (ADR-025): scheduling and test sends
// answer 409 NEWSLETTER_NOT_CONFIGURED until Brevo SMTP is set. Elsewhere mail is printed / captured.
describe('assertNewsletterReady', () => {
  it('refuses in production without newsletter SMTP', () => {
    expect(() => assertNewsletterReady(true, false)).toThrow(expect.objectContaining({ status: 409, code: 'NEWSLETTER_NOT_CONFIGURED' }));
  });
  it.each([[true, true], [false, false], [false, true]])('allows production=%s configured=%s', (production, configured) => {
    expect(() => assertNewsletterReady(production, configured)).not.toThrow();
  });
});
