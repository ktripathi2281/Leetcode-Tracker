import type { RequestHandler } from 'express';
import { API_TOKEN_PREFIX, type ApiError } from '@lct/shared';
import { ApiToken, hashToken } from '../models/ApiToken.js';
import { User, toAuthUser } from '../models/User.js';

const LAST_USED_RESOLUTION_MS = 60_000; // don't write on every request

const unauthorized: ApiError = { message: 'This access token is invalid or was revoked. Create a new one in Settings.' };

/** Signs in with a personal access token (the browser extension). Only for extension routes. */
export const requireApiToken: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith(`Bearer ${API_TOKEN_PREFIX}`) ? header.slice(7) : null;
  const record = token ? await ApiToken.findOne({ tokenHash: hashToken(token) }) : null;
  const user = record ? await User.findById(record.user) : null;
  if (!record || !user) {
    res.status(401).json(unauthorized);
    return;
  }

  const now = Date.now();
  if (!record.lastUsedAt || now - record.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    await ApiToken.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date(now) } });
  }
  req.user = toAuthUser(user);
  req.userId = user._id;
  next();
};
