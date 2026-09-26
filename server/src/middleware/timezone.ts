import type { RequestHandler } from 'express';
import { TIMEZONE_HEADER } from '@lct/shared';
import { isValidTimeZone } from '../lib/time.js';

/** Reads the browser's IANA time zone (e.g. "Asia/Kolkata") from a header; UTC if missing or unknown. */
export const timeZone: RequestHandler = (req, _res, next) => {
  const header = req.get(TIMEZONE_HEADER);
  req.timeZone = header && header.length <= 64 && isValidTimeZone(header) ? header : 'UTC';
  next();
};
