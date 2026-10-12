import jwt from 'jsonwebtoken';
import { signAccessToken } from '../../services/jwt.service';

export const adminToken = (): string => signAccessToken({ sub: 'admin-id', role: 'admin' });
export const customerToken = (): string => signAccessToken({ sub: 'customer-id', role: 'customer' });

// Token signed with the right payload but a secret the server does not know.
export const forgedToken = (): string =>
  jwt.sign({ sub: 'admin-id', role: 'admin' }, 'some-other-secret', { expiresIn: '15m' });

// Token with the right secret that expired ten seconds ago.
export const expiredToken = (): string =>
  jwt.sign({ sub: 'admin-id', role: 'admin' }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: -10 });

// Unsigned token claiming `alg: none`, the classic bypass attempt.
export const algNoneToken = (): string => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'admin-id', role: 'admin' })}.`;
};
