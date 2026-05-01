/**
 * Tests for `sqlite/lifecycle.ts` (rf-sqlite-6).
 *
 * Behaviour pinned (preserved from pre-extraction L83-149 + L717-805):
 *  - initialize sets ctx.db, runs DDL (4 tables + 5 indexes), and primes
 *    2 prepared statements (upsert_resource, upsert_deployment)
 *  - initialize is robust to wal_mode=false and foreign_keys=false
 *    (those pragmas are conditional; busy_timeout always fires)
 *  - close clears ctx.db AND ctx.statements; close-when-not-open is
 *    a no-op (no throw, no failure return)
 *  - close is idempotent — calling it twice in a row returns success
 *    both times
 *  - health_check returns success(false) for uninitialized AND for
 *    query-throws; both paths use `success`, never `failure`
 *  - health_check returns success(true) on a working DB
 *  - create_tables / prepare_statements are independently testable
 *    against a directly-opened in-memory DB
 */
import { describe, it, expect } from 'vitest';
import {
  create_tables,
  lifecycle_close,
  lifecycle_health_check,
  lifecycle_initialize,
  prepare_statements,
} from '../lifecycle.js';
import type { SqliteContext, SqliteStateStoreOptions } from '../types.js';
import type { Database, Statement } from 'better-sqlite3';

function makeCtx(): SqliteContext {
  return { db: null, listeners: new Set(), statements: new Map() };
}

const memoryOptions: Required<SqliteStateStoreOptions> = {
  path: ':memory:',
  wal_mode: false, // WAL on :memory: is a no-op anyway; switching off keeps the test fast.
  busy_timeout_ms: 5000,
  foreign_keys: true,
};

describe('lifecycle_initialize', () => {
  it('opens an in-memory DB and primes the statement cache with both upserts', async () => {
    const ctx = makeCtx();
    const result = await lifecycle_initialize(ctx, memoryOptions);
    expect(result.ok).toBe(true);
    expect(ctx.db).not.toBeNull();
    expect(ctx.statements.has('upsert_resource')).toBe(true);
    expect(ctx.statements.has('upsert_deployment')).toBe(true);
    await lifecycle_close(ctx);
  });

  it('creates the four tables (resources, deployments, locks, snapshots)', async () => {
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    const tables = ctx
      .db!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(['deployments', 'locks', 'resources', 'snapshots']);
    await lifecycle_close(ctx);
  });

  it('creates the indexes (idx_resources_graph, idx_locks_expires, etc.)', async () => {
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    const indexes = ctx
      .db!.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toEqual([
      'idx_deployments_graph',
      'idx_deployments_status',
      'idx_locks_expires',
      'idx_resources_graph',
      'idx_resources_status',
      'idx_resources_type',
      'idx_snapshots_graph',
    ]);
    await lifecycle_close(ctx);
  });

  it('honours wal_mode=true (sets journal_mode pragma)', async () => {
    // We can't test WAL on :memory: meaningfully (it's always 'memory'),
    // but the pragma call should not throw.
    const ctx = makeCtx();
    const result = await lifecycle_initialize(ctx, { ...memoryOptions, wal_mode: true });
    expect(result.ok).toBe(true);
    await lifecycle_close(ctx);
  });

  it('foreign_keys=false does NOT throw (pragma is conditional, default fk state preserved)', async () => {
    // Note: better-sqlite3's default foreign_keys state in this build is
    // already 1 (ON), so we can't distinguish "didn't fire pragma" from
    // "fired pragma to value=1" by reading pragma. We pin only that
    // initialize itself does not throw with foreign_keys=false.
    const ctx = makeCtx();
    const result = await lifecycle_initialize(ctx, { ...memoryOptions, foreign_keys: false });
    expect(result.ok).toBe(true);
    await lifecycle_close(ctx);
  });

  it('honours foreign_keys=true (pragma fires; FKs are ON)', async () => {
    const ctx = makeCtx();
    const result = await lifecycle_initialize(ctx, { ...memoryOptions, foreign_keys: true });
    expect(result.ok).toBe(true);
    const fk = ctx.db!.pragma('foreign_keys', { simple: true }) as number;
    expect(fk).toBe(1);
    await lifecycle_close(ctx);
  });

  it('applies busy_timeout pragma', async () => {
    const ctx = makeCtx();
    const result = await lifecycle_initialize(ctx, { ...memoryOptions, busy_timeout_ms: 1234 });
    expect(result.ok).toBe(true);
    const bt = ctx.db!.pragma('busy_timeout', { simple: true }) as number;
    expect(bt).toBe(1234);
    await lifecycle_close(ctx);
  });
});

describe('lifecycle_close', () => {
  it('clears ctx.db and ctx.statements', async () => {
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    expect(ctx.db).not.toBeNull();
    expect(ctx.statements.size).toBeGreaterThan(0);

    const result = await lifecycle_close(ctx);
    expect(result.ok).toBe(true);
    expect(ctx.db).toBeNull();
    expect(ctx.statements.size).toBe(0);
  });

  it('is idempotent — closing an already-closed ctx returns success', async () => {
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    await lifecycle_close(ctx);
    const second = await lifecycle_close(ctx);
    expect(second.ok).toBe(true);
  });

  it('closes a never-initialized ctx without throwing', async () => {
    const ctx = makeCtx();
    const result = await lifecycle_close(ctx);
    expect(result.ok).toBe(true);
  });
});

describe('lifecycle_health_check', () => {
  it('returns success(false) for an uninitialized ctx', async () => {
    const ctx = makeCtx();
    const result = await lifecycle_health_check(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
  });

  it('returns success(true) for a healthy initialized ctx', async () => {
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    const result = await lifecycle_health_check(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
    await lifecycle_close(ctx);
  });

  it('returns success(false) when SELECT 1 throws (closed db)', async () => {
    // Close the db to make subsequent prepare/run fail, then call
    // health_check — pre-extraction returned `success(false)` (catch
    // swallows), NOT `failure(...)`.
    const ctx = makeCtx();
    await lifecycle_initialize(ctx, memoryOptions);
    ctx.db!.close();
    // Don't null out ctx.db — health_check checks for null first; we
    // want to exercise the "throws" branch, not the "no db" branch.
    const result = await lifecycle_health_check(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(false);
    // Reset so close doesn't double-close.
    ctx.db = null;
    ctx.statements.clear();
  });
});

describe('create_tables / prepare_statements (direct)', () => {
  it('create_tables runs idempotently (CREATE TABLE IF NOT EXISTS)', async () => {
    // Open a raw DB without going through lifecycle_initialize so we
    // can run create_tables twice.
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(':memory:') as Database;
    create_tables(db);
    expect(() => create_tables(db)).not.toThrow();
    db.close();
  });

  it('prepare_statements populates exactly the two known statements', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(':memory:') as Database;
    create_tables(db);
    const statements = new Map<string, Statement>();
    prepare_statements(db, statements);
    expect(statements.size).toBe(2);
    expect(statements.has('upsert_resource')).toBe(true);
    expect(statements.has('upsert_deployment')).toBe(true);
    db.close();
  });
});
