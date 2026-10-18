import { describe, expect, it } from 'vitest';
import { assertLocalDatabase } from '../scripts/localDbGuard';

// The demo-catalogue seed writes products into whatever DATABASE_URL points at. Production is a
// real shop with real customers, so the seed must refuse anything that is not this machine.
describe('assertLocalDatabase', () => {
  it('accepts the local Docker database', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@localhost:5434/tupetshop_dev')).not.toThrow();
    expect(() => assertLocalDatabase('postgresql://u:p@127.0.0.1:5434/tupetshop_dev?schema=public')).not.toThrow();
  });

  it('refuses a remote host such as the Supabase production database', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres')).toThrow(/local/);
    expect(() => assertLocalDatabase('postgresql://u:p@db.example.com:5432/tupetshop_dev')).toThrow(/local/);
  });

  it('refuses a host that only looks local', () => {
    expect(() => assertLocalDatabase('postgresql://u:p@localhost.evil.com:5432/x')).toThrow(/local/);
  });

  it('refuses a missing or malformed URL', () => {
    expect(() => assertLocalDatabase(undefined)).toThrow(/DATABASE_URL/);
    expect(() => assertLocalDatabase('not a url')).toThrow(/DATABASE_URL/);
  });
});
