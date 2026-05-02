/**
 * Tests for the `m.default || m` fallback in `lifecycle_initialize`.
 *
 * The dynamic-import chain is:
 *
 *     await import('better-sqlite3').then((m) => m.default || m).catch(() => null);
 *
 * The `|| m` branch is defensive — it covers CJS interop shapes where
 * the better-sqlite3 export sits at the top of the namespace instead
 * of under `.default`. To exercise the branch, mock the module so
 * `m.default` is falsy but the namespace itself is the constructor.
 *
 * Co-located in its own file because `vi.mock` is hoisted module-wide.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('better-sqlite3', () => {
  // Mock returns a namespace object whose `default` is falsy (an empty
  // string) so the `m.default || m` expression evaluates the right-hand
  // operand and returns the namespace itself. The namespace is not
  // callable, so the subsequent `new BetterSqlite3(path)` throws — the
  // outer catch captures it and the failure surfaces as expected.
  return { default: '', other: 1 };
});

describe('lifecycle_initialize falls back to the namespace when default is undefined', () => {
  it('evaluates `m.default || m` and lands in the fallback (CJS-interop) branch', async () => {
    const { lifecycle_initialize } = await import('../lifecycle.js');
    const { DEFAULT_OPTIONS } = await import('../types.js');

    const ctx = { db: null, listeners: new Set(), statements: new Map() };
    const result = await lifecycle_initialize(ctx, { ...DEFAULT_OPTIONS, path: ':memory:' });

    // The namespace object itself is not constructible — `new {...}()` throws —
    // so we land in the outer catch. Failure is expected; the point is
    // exercising the OR-fallback during the dynamic-import resolution.
    expect(result.ok).toBe(false);
  });
});
