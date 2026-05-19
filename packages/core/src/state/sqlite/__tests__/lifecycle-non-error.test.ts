/**
 * Tests for `lifecycle_initialize` covering the non-Error catch branch.
 *
 * The catch in `lifecycle_initialize` has the defensive coercion:
 *
 *     const err = error instanceof Error ? error : new Error(String(error));
 *
 * To cover the `: new Error(String(error))` branch we must make the
 * constructor throw a non-Error value (a string, a number, etc.).
 * Real better-sqlite3 always throws SqliteError, so we replace the
 * module with a constructor that throws a plain string.
 *
 * Co-located in its own file because `vi.mock` is hoisted module-wide.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('better-sqlite3', () => {
  // Mock returns a constructor function that throws a plain-string value.
  // The dynamic import inside lifecycle_initialize resolves to this
  // namespace, m.default = the constructor, `new BetterSqlite3(...)` then
  // throws a string → catch fires → instanceof Error is false → the
  // String(error) branch runs.
  function ThrowingConstructor(): never {
    throw 'sqlite-non-error-throw';
  }
  return { default: ThrowingConstructor };
});

describe('lifecycle_initialize coerces non-Error throws', () => {
  it('wraps a non-Error throw via String(error) (defensive branch)', async () => {
    const { lifecycle_initialize } = await import('../lifecycle');
    const { DEFAULT_OPTIONS } = await import('../types');

    const ctx = { db: null, listeners: new Set(), statements: new Map() };
    const result = await lifecycle_initialize(ctx, { ...DEFAULT_OPTIONS, path: ':memory:' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to initialize SQLite state store');
      expect(result.error.message).toContain('sqlite-non-error-throw');
    }
  });
});
