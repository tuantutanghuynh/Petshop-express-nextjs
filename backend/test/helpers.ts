import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;

export function tokenFor(role: 'admin' | 'customer', options: jwt.SignOptions = { expiresIn: '15m' }): string {
  return jwt.sign({ sub: 'user-1', role }, ACCESS_SECRET, options);
}

// Builds an unsigned JWT with `alg: none`, the classic forged-token attack.
export function unsignedToken(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1', role })}.`;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
