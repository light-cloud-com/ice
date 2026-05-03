/**
 * Smoke test for the services/canvas barrel + createCanvasRouter.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {},
}));

import { createCanvasRouter } from '../index';
import * as Canvas from '../index';

describe('services/canvas barrel', () => {
  it('exposes createCanvasRouter as a function', () => {
    expect(typeof createCanvasRouter).toBe('function');
  });

  it('createCanvasRouter returns an express router with mounted sub-routes', () => {
    const router = createCanvasRouter();
    expect(router).toBeDefined();
    expect(typeof (router as any).use).toBe('function');
    expect(typeof (router as any).post).toBe('function');
  });

  it('re-exports the service modules (canvas.service, canvas-validation.service, environment.service)', () => {
    // The barrel re-exports the public API of the three service files.
    // Just smoke-check that the imported namespace contains executable values.
    const exports = Object.keys(Canvas);
    expect(exports.length).toBeGreaterThan(0);
    expect(exports).toContain('createCanvasRouter');
  });
});
