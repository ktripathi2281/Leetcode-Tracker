import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import type { ApiError } from '@lct/shared';
import { User, toAuthUser } from '../models/User.js';
import { verifyToken } from '../lib/tokens.js';

const unauthorized: ApiError = { message: 'Please sign in to continue.' };

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token ? verifyToken(token) : null;

  if (!claims || !isValidObjectId(claims.userId)) {
    res.status(401).json(unauthorized);
    return;
  }

  // Check the account still exists and the session wasn't ended (password change,
  // "sign out everywhere"), so old tokens stop working.
  const user = await User.findById(claims.userId);
  if (!user || (user.tokenVersion ?? 0) !== claims.version) {
    res.status(401).json(unauthorized);
    return;
  }

  req.user = toAuthUser(user);
  req.userId = user._id;
  next();
};
