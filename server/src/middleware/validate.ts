import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { ApiError } from '@lct/shared';

export function sendValidationError(res: Response, error: z.ZodError) {
  const body: ApiError = {
    message: error.issues[0]?.message ?? 'Invalid input',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
  res.status(400).json(body);
}

// Validates req.body against a schema and replaces it with the parsed (trimmed, normalized) data.
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendValidationError(res, result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
