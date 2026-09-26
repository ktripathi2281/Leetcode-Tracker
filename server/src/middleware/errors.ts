import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@lct/shared';

export const notFound: RequestHandler = (req, res) => {
  const body: ApiError = { message: `Not found: ${req.method} ${req.originalUrl}` };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Client errors raised by Express itself, e.g. malformed JSON bodies.
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 400 && status < 500) {
    const body: ApiError = { message: status === 400 ? 'Malformed request body' : err.message };
    res.status(status).json(body);
    return;
  }

  console.error('Unhandled error:', err);
  const body: ApiError = { message: 'Internal server error' };
  res.status(500).json(body);
};
