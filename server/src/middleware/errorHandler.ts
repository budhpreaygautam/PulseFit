import { Request, Response, NextFunction } from 'express';
import config from '../config.js';
import { ApiError } from '../lib/http.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, error: `No API route for ${req.method} ${req.originalUrl}.`, code: 'NOT_FOUND' });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { success: false, error: err.message };
    if (err.code) body.code = err.code;
    if (err.data !== undefined) body.data = err.data;
    return res.status(err.status).json(body);
  }

  // express.json() failures
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'The request body is not valid JSON.', code: 'BAD_JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'The request is too large.', code: 'TOO_LARGE' });
  }

  console.error(`API error on ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({
    success: false,
    error: config.isProduction ? 'Something went wrong on our side. Please try again.' : err?.message || 'Internal Server Error',
    code: 'INTERNAL'
  });
}
