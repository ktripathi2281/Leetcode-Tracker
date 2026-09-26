import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export function hashPassword(password: string) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Used when a login email doesn't exist, so the response takes as long as a real
// password check and doesn't reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= bcrypt.hash('not-a-real-password', env.BCRYPT_ROUNDS);
  await bcrypt.compare(password, await dummyHash);
}
