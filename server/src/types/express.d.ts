import type { Types } from 'mongoose';
import type { AuthUser } from '@lct/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: AuthUser;
      /** Set by requireAuth; use this (not user.id) in database queries. */
      userId?: Types.ObjectId;
      /** The user's IANA time zone, set by the timeZone middleware (UTC by default). */
      timeZone: string;
    }
  }
}
