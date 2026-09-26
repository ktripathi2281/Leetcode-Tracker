import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@lct/shared';

export const notFound: RequestHandler = (req, res) => {
  const body: ApiError = { message: `Not found: ${req.method} ${req.originalUrl}` };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  const body: ApiError = { message: 'Internal server error' };
  res.status(500).json(body);
};
