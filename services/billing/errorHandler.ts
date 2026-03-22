/**
 * Error Handler Stub
 *
 * Placeholder — the real implementation was lost during the modular refactor.
 */

import { Response } from 'express';

export function errorHandler(res: Response, error: unknown, context: string = 'Operation') {
  console.error(`[Billing] ${context} error:`, error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({ error: `${context} failed`, message });
}
