import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const TOKEN_LIFETIME = '7d';

export function signToken(userId: string) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
  });
}

// Returns the user ID, or null if the token is invalid or expired.
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
