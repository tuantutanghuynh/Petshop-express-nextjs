import crypto from 'crypto';
import prisma from './prisma';

// Lifecycle of refresh tokens: issuing, rotating and revoking them. Unlike access tokens,
// these are stored in the database so a session can actually be killed, and they implement
// rotation with reuse detection — the mechanism that limits the damage of a stolen token.

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// Hashes a raw token with SHA-256 before it touches the database. Only the hash is stored,
// so a leaked database dump cannot be replayed as valid sessions — the same reasoning as
// hashing passwords. SHA-256 is enough here (unlike for passwords, where bcrypt is used)
// because the token is 80 hex characters of cryptographic randomness, not a guessable
// secret, so slow hashing buys nothing against brute force.
function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Creates a new refresh token for a user and stores only its hash with a 7-day expiry.
// Returns the raw token, which is the one and only time it exists in plaintext — it goes to
// the client and can never be recovered from the database afterwards. The value comes from
// `crypto.randomBytes` rather than a JWT because this token carries no claims; it is just
// an opaque lookup key, which keeps it short and makes revocation a simple row update.
export async function issueRefreshToken(userId: string): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString('hex');

    await prisma.refreshToken.create({
        data: {
            userId,
            tokenHash: hashToken(rawToken),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
        }
    });

    return rawToken;
}

// Exchanges a valid refresh token for a brand new one, returning `{ userId, rawToken }`, or
// `null` for any token that must be rejected. The lookup deliberately ignores revocation
// status at first, because finding an already-revoked token is the signal that matters: a
// revoked token can only be replayed by someone who kept a copy, so every active session of
// that user is revoked immediately and the caller is forced to log in again. A valid token
// is revoked before a replacement is issued, so each refresh token is usable exactly once
// and a stolen one stops working as soon as the real user refreshes.
export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; rawToken: string } | null> {
    const tokenHash = hashToken(rawToken);

    const record = await prisma.refreshToken.findFirst({
        where: { tokenHash }
    });

    if (!record) {
        return null;
    }

    if (record.revokedAt !== null) {
        await prisma.refreshToken.updateMany({
            where: { userId: record.userId, revokedAt: null },
            data: { revokedAt: new Date() }
        });
        return null;
    }

    if (new Date() > record.expiresAt) {
        return null;
    }

    // Revoke with a conditional update and check that THIS call is the one that did it. The read
    // above is only a snapshot: ten concurrent refreshes with the same token all saw
    // `revokedAt = null`, and with an unconditional update every one of them went on to issue a
    // fresh token — one stolen token became ten live sessions and reuse detection never fired.
    // Losing this race means somebody else already spent the token, which is exactly the replay
    // signal handled above, so it is treated the same way.
    const { count } = await prisma.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
    });

    if (count !== 1) {
        await prisma.refreshToken.updateMany({
            where: { userId: record.userId, revokedAt: null },
            data: { revokedAt: new Date() }
        });
        return null;
    }

    const newRawToken = await issueRefreshToken(record.userId);
    return { userId: record.userId, rawToken: newRawToken };
}

// Marks a single refresh token as revoked, which is what logging out does. It uses
// `updateMany` filtered on `revokedAt: null` so calling it twice is harmless and an already
// revoked token is left untouched — re-stamping the timestamp would erase when the session
// actually ended. Note it stays silent when no row matches: a logout request carrying a
// bogus token should not leak whether that token ever existed.
export async function revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);

    await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
    });
}

export default { issueRefreshToken, rotateRefreshToken, revokeRefreshToken };
