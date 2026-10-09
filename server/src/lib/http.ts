import { NextFunction, Request, Response, RequestHandler } from 'express';
import type { ZodType } from 'zod';

// Response envelope used by every endpoint:
//   success: { success: true, data, message? }
//   failure: { success: false, error, code?, data? }
// `error` is a sentence a gym member or admin can read; `code` is for the client to branch on.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', data?: unknown) => new ApiError(400, message, code, data);
export const unauthorized = (message = 'Please sign in to continue.', code = 'UNAUTHORIZED') => new ApiError(401, message, code);
export const forbidden = (message = 'You do not have permission to do that.', code = 'FORBIDDEN', data?: unknown) => new ApiError(403, message, code, data);
export const notFound = (message = 'Not found.', code = 'NOT_FOUND') => new ApiError(404, message, code);
export const conflict = (message: string, code = 'CONFLICT', data?: unknown) => new ApiError(409, message, code, data);
export const unavailable = (message: string, code = 'UNAVAILABLE') => new ApiError(503, message, code);

/** Wrap an async route so a thrown ApiError (or any error) reaches the error handler. */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

export function ok(res: Response, data: unknown, message?: string, status = 200) {
  return res.status(status).json(message ? { success: true, data, message } : { success: true, data });
}

function describeIssue(issue: { path: PropertyKey[]; message: string }): string {
  const field = issue.path.map(String).join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

/** Validate input with a zod schema; throws a 400 VALIDATION_ERROR naming the first bad field. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const issues = result.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message }));
    throw new ApiError(400, describeIssue(result.error.issues[0]), 'VALIDATION_ERROR', { issues });
  }
  return result.data;
}
