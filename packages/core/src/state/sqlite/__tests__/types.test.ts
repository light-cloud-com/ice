/**
 * Tests for `sqlite/types.ts` (rf-sqlite-1).
 *
 * Pins the `DEFAULT_OPTIONS` constant — the pre-extraction class
 * inlined this object literal in its constructor; downstream
 * helpers and external callers depend on these specific values
 * (`.ice/state.db`, WAL mode on, 5s busy timeout, FKs on). A
 * regression here would silently change the on-disk path or
 * concurrency semantics for every consumer of `create_sqlite_state_store()`
 * without an option override, which is the common production shape.
 *
 * The row interfaces are typecheck-only (no runtime presence), so
 * they're not covered with runtime assertions — `pnpm typecheck`
 * is the line of defense for those.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS, type SqliteContext, type SqliteStateStoreOptions } from '../types.js';

describe('DEFAULT_OPTIONS', () => {
  it('uses .ice/state.db as the default on-disk path', () => {
    expect(DEFAULT_OPTIONS.path).toBe('.ice/state.db');
  });

  it('enables WAL mode by default', () => {
    expect(DEFAULT_OPTIONS.wal_mode).toBe(true);
  });

  it('uses 5 second busy timeout by default', () => {
    expect(DEFAULT_OPTIONS.busy_timeout_ms).toBe(5000);
  });

  it('enables foreign keys by default', () => {
    expect(DEFAULT_OPTIONS.foreign_keys).toBe(true);
  });

  it('exposes all four required keys (no partials)', () => {
    // Required<SqliteStateStoreOptions> — every field present.
    const keys = Object.keys(DEFAULT_OPTIONS).sort();
    expect(keys).toEqual(['busy_timeout_ms', 'foreign_keys', 'path', 'wal_mode']);
  });

  it('survives Required<SqliteStateStoreOptions> assignment', () => {
    // Compile-time check posed at runtime — if the type drifts and
    // a key becomes optional in `Required<...>`, this assignment
    // still passes but the typecheck step will catch it.
    const _required: Required<SqliteStateStoreOptions> = DEFAULT_OPTIONS;
    expect(_required.path).toBe(DEFAULT_OPTIONS.path);
  });
});

describe('SqliteContext shape', () => {
  it('accepts a db=null context with empty listener / statement caches', () => {
    // Confirms the orchestrator can construct an empty context
    // before initialize() is called — matches the pre-extraction
    // class field defaults at construction time.
    const ctx: SqliteContext = {
      db: null,
      listeners: new Set(),
      statements: new Map(),
    };
    expect(ctx.db).toBeNull();
    expect(ctx.listeners.size).toBe(0);
    expect(ctx.statements.size).toBe(0);
  });
});
