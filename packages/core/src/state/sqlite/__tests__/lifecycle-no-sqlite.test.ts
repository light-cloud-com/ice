/**
 * Tests for `lifecycle_initialize` when better-sqlite3 is unavailable.
 *
 * `lifecycle_initialize` does a dynamic `import('better-sqlite3')` and
 * falls back to a clear "not installed" failure if the import rejects.
 * The `.catch(() => null)` in the chain means we have to make the
 * import REJECT to land in the "not installed" branch (lines 152-158).
 *
 * Lives in its own file because `vi.mock` is hoisted module-wide and
 * cannot be toggled between tests within a single file. Keeping this
 * isolated also avoids contaminating the happy-path lifecycle tests.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('better-sqlite3', () => {
  throw new Error('Cannot find module: better-sqlite3');
});

describe('lifecycle_initialize when better-sqlite3 is missing', () => {
  it('returns "not installed" failure (the falsy-import branch)', async () => {
    // Import lazily after the mock is registered so the SUT picks it up.
    const { lifecycle_initialize } = await import('../lifecycle.js');
    const { DEFAULT_OPTIONS } = await import('../types.js');

    const ctx = { db: null, listeners: new Set(), statements: new Map() };
    const result = await lifecycle_initialize(ctx, DEFAULT_OPTIONS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('better-sqlite3 is not installed');
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
