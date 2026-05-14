/**
 * Companion to `ai-schema-context.service.test.ts` — covers the catch
 * branch in `getCachedSchemas` when `await import('@ice/core')` itself
 * rejects.
 *
 * Per `vitest-4-strict-mock-surface-and-throwing-factory-needs-isolated-
 * file`, a hoisted throwing factory poisons every downstream test in the
 * same file. So this branch lives alone here.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/core', () => {
  throw new Error('module-load-failure');
});

describe('buildSchemaContext — @ice/core import failure', () => {
  it('returns "" when the dynamic import of @ice/core throws', async () => {
    const { buildSchemaContext } = await import('../ai-schema-context.service');
    const out = await buildSchemaContext({
      existingIceTypes: ['anything'],
      dominantProvider: 'gcp',
    });
    expect(out).toBe('');
  });
});
