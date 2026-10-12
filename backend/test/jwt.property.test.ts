import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../services/jwt.service';

describe('jwt.service properties', () => {
  it('never accepts an arbitrary string as an access token', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => verifyAccessToken(input)).toThrow();
      }),
      { seed: 42 },
    );
  });

  it('round-trips the subject and role for any payload', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.constantFrom('admin', 'customer'), (sub, role) => {
        const decoded = verifyAccessToken(signAccessToken({ sub, role }));
        expect(decoded.sub).toBe(sub);
        expect((decoded as { role: string }).role).toBe(role);
      }),
      { seed: 42 },
    );
  });

  it('issues tokens that expire in 15 minutes', () => {
    const { iat, exp } = jwt.decode(signAccessToken({ sub: 'u', role: 'customer' })) as { iat: number; exp: number };
    expect(exp - iat).toBe(15 * 60);
  });
});
