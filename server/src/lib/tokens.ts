import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const TOKEN_LIFETIME = '7d';

export interface SessionClaims {
  userId: string;
  /**
   * The user's session version when the token was issued. Bumping the user's version
   * (password change or reset, "sign out everywhere") invalidates all older tokens.
   */
  version: number;
}

export function signToken(userId: string, version: number) {
  return jwt.sign({ v: version }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
  });
}

// Returns the claims, or null if the token is invalid or expired.
export function verifyToken(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') return null;
    // Tokens from before session versions existed count as version 0.
    const version = typeof payload.v === 'number' ? payload.v : 0;
    return { userId: payload.sub, version };
  } catch {
    return null;
  }
}
