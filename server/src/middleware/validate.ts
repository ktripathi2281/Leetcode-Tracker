import type { RequestHandler } from 'express';
import type { z } from 'zod';
import type { ApiError } from '@lct/shared';

// Validates req.body against a schema and replaces it with the parsed (trimmed, normalized) data.
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const body: ApiError = {
        message: result.error.issues[0]?.message ?? 'Invalid input',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
      res.status(400).json(body);
      return;
    }
    req.body = result.data;
    next();
  };
}
