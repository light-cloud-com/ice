/**
 * Unit tests for `services/ai/src/services/ai-audit.service.ts`.
 *
 * The service is a thin wrapper over `prisma.aiAuditLog` with two pure
 * helpers (`createAuditEntry`, `finalizeAuditEntry`) and three I/O
 * helpers (`writeAuditEntry`, `listAuditEntries`, `getAuditEntry`).
 * Per the project convention, the prisma client is mocked at the module
 * level — there is no real DB in the unit-test loop.
 *
 * Per `services-deploy-test-explicit-vitest-imports`, the vitest globals
 * are imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-
 * without-explicit-reset`, mocks are cleared in `beforeEach`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    aiAuditLog: {
      create: mocks.create,
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
    },
  },
}));

import {
  createAuditEntry,
  finalizeAuditEntry,
  writeAuditEntry,
  listAuditEntries,
  getAuditEntry,
} from '../ai-audit.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // create() is fire-and-forget — default to resolved so unhandled rejection
  // warnings don't bleed across test boundaries.
  mocks.create.mockResolvedValue(undefined);
});

describe('createAuditEntry', () => {
  it('returns an entry with id, ISO timestamp, intent and the configured model', () => {
    const entry = createAuditEntry('add a redis', { nodes: [], edges: [] });
    expect(entry.id).toMatch(/^\d+-[a-z0-9]+$/);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.intent).toBe('add a redis');
    expect(entry.model).toBe('claude-sonnet-4-20250514');
    expect(entry.parseSuccess).toBe(false);
    expect(entry.durationMs).toBe(0);
    expect(entry.operations).toEqual([]);
    expect(entry.rawResponse).toBe('');
  });

  it('captures node and edge counts plus a flat node summary', () => {
    const entry = createAuditEntry('intent', {
      nodes: [
        { id: 'n1', data: { iceType: 'Database', label: 'pg' } },
        { id: 'n2', data: { iceType: 'Compute', label: 'web' } },
      ],
      edges: [{ source: 'n1', target: 'n2', data: { relationship: 'connects-to' } }],
    });

    expect(entry.canvasBefore.nodeCount).toBe(2);
    expect(entry.canvasBefore.edgeCount).toBe(1);
    expect(entry.canvasBefore.nodes).toEqual([
      { id: 'n1', iceType: 'Database', label: 'pg' },
      { id: 'n2', iceType: 'Compute', label: 'web' },
    ]);
    expect(entry.canvasBefore.edges).toEqual([
      { source: 'n1', target: 'n2', relationship: 'connects-to' },
    ]);
  });

  it('falls back to top-level iceType and label when data wrapper is absent', () => {
    const entry = createAuditEntry('intent', {
      nodes: [{ id: 'n1', iceType: 'Database', label: 'pg' }],
      edges: [{ source: 'n1', target: 'n2', relationship: 'feeds' }],
    });
    expect(entry.canvasBefore.nodes[0]).toEqual({ id: 'n1', iceType: 'Database', label: 'pg' });
    expect(entry.canvasBefore.edges[0]).toEqual({
      source: 'n1',
      target: 'n2',
      relationship: 'feeds',
    });
  });

  it('treats missing nodes/edges arrays as empty', () => {
    const entry = createAuditEntry('intent', {});
    expect(entry.canvasBefore.nodeCount).toBe(0);
    expect(entry.canvasBefore.edgeCount).toBe(0);
    expect(entry.canvasBefore.nodes).toEqual([]);
    expect(entry.canvasBefore.edges).toEqual([]);
  });

  it('produces unique ids on consecutive calls', () => {
    const a = createAuditEntry('a', {});
    const b = createAuditEntry('b', {});
    expect(a.id).not.toBe(b.id);
  });
});

describe('finalizeAuditEntry', () => {
  function blank() {
    return createAuditEntry('intent', {});
  }

  it('copies operations, rawResponse, parseSuccess, durationMs, error and validation hooks', () => {
    const entry = blank();
    finalizeAuditEntry(entry, {
      operations: [{ op: 'addNode' }],
      rawResponse: '{"x":1}',
      parseSuccess: true,
      durationMs: 432,
      error: undefined,
      schemaValidation: { valid: true, errorCount: 0 },
      deployDryRun: { success: true, deployableCount: 2 },
    });

    expect(entry.operations).toEqual([{ op: 'addNode' }]);
    expect(entry.rawResponse).toBe('{"x":1}');
    expect(entry.parseSuccess).toBe(true);
    expect(entry.durationMs).toBe(432);
    expect(entry.schemaValidation).toEqual({ valid: true, errorCount: 0 });
    expect(entry.deployDryRun).toEqual({ success: true, deployableCount: 2 });
  });

  it('defaults missing fields to safe values (operations [], rawResponse "", parseSuccess false, durationMs 0)', () => {
    const entry = blank();
    finalizeAuditEntry(entry, {});
    expect(entry.operations).toEqual([]);
    expect(entry.rawResponse).toBe('');
    expect(entry.parseSuccess).toBe(false);
    expect(entry.durationMs).toBe(0);
    expect(entry.error).toBeUndefined();
    expect(entry.schemaValidation).toBeUndefined();
    expect(entry.deployDryRun).toBeUndefined();
  });

  it('honours an explicit parseSuccess: false (?? does not collapse to default)', () => {
    const entry = blank();
    entry.parseSuccess = true; // pre-set to detect the explicit-false branch.
    finalizeAuditEntry(entry, { parseSuccess: false });
    expect(entry.parseSuccess).toBe(false);
  });

  it('records an error message when one is supplied', () => {
    const entry = blank();
    finalizeAuditEntry(entry, { error: 'upstream' });
    expect(entry.error).toBe('upstream');
  });
});

describe('writeAuditEntry', () => {
  function fixture() {
    const e = createAuditEntry('intent', { nodes: [{ id: 'n' }], edges: [] });
    finalizeAuditEntry(e, {
      operations: [{ op: 'noop' }],
      rawResponse: 'raw',
      parseSuccess: true,
      durationMs: 5,
      schemaValidation: { valid: true, errorCount: 0 },
      deployDryRun: { success: true, deployableCount: 1 },
    });
    return e;
  }

  it('passes a flat record (with snake_case keys) through to prisma.create', () => {
    const e = fixture();
    writeAuditEntry(e);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const arg = mocks.create.mock.calls[0]![0];
    expect(arg.data).toMatchObject({
      id: e.id,
      intent: 'intent',
      raw_response: 'raw',
      parse_success: true,
      duration_ms: 5,
      model: 'claude-sonnet-4-20250514',
      error: null,
    });
    expect(arg.data.canvas_before).toBe(e.canvasBefore);
    expect(arg.data.operations).toBe(e.operations);
    expect(arg.data.schema_validation).toEqual({ valid: true, errorCount: 0 });
    expect(arg.data.deploy_dry_run).toEqual({ success: true, deployableCount: 1 });
  });

  it('coerces an undefined error to null on the wire (defensive)', () => {
    const e = fixture();
    e.error = undefined;
    writeAuditEntry(e);
    expect(mocks.create.mock.calls[0]![0].data.error).toBeNull();
  });

  it('forwards a non-empty error string verbatim', () => {
    const e = fixture();
    e.error = 'upstream-failure';
    writeAuditEntry(e);
    expect(mocks.create.mock.calls[0]![0].data.error).toBe('upstream-failure');
  });

  it('passes undefined for schema_validation / deploy_dry_run when those hooks are absent', () => {
    const e = createAuditEntry('intent', {});
    finalizeAuditEntry(e, {});
    writeAuditEntry(e);
    const data = mocks.create.mock.calls[0]![0].data;
    expect(data.schema_validation).toBeUndefined();
    expect(data.deploy_dry_run).toBeUndefined();
  });

  it('swallows a prisma rejection so the caller is never broken (fire-and-forget)', async () => {
    mocks.create.mockRejectedValue(new Error('db down'));
    const e = fixture();

    // The function returns void synchronously; the rejection is attached to
    // the floating promise. Awaiting a microtask cycle gives `.catch(...)`
    // a chance to run — if it didn't swallow, an unhandled rejection would
    // propagate and fail the test runner.
    expect(() => writeAuditEntry(e)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe('listAuditEntries', () => {
  it('maps prisma rows to {id, timestamp (ISO), intent}', async () => {
    const created = new Date('2026-05-02T10:00:00.000Z');
    mocks.findMany.mockResolvedValue([
      { id: 'a', created_at: created, intent: 'i-a' },
      { id: 'b', created_at: created, intent: 'i-b' },
    ]);
    const out = await listAuditEntries();
    expect(out).toEqual([
      { id: 'a', timestamp: '2026-05-02T10:00:00.000Z', intent: 'i-a' },
      { id: 'b', timestamp: '2026-05-02T10:00:00.000Z', intent: 'i-b' },
    ]);
  });

  it('omits the where clause when no orgId is supplied (matches all orgs)', async () => {
    mocks.findMany.mockResolvedValue([]);
    await listAuditEntries(50);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        select: { id: true, created_at: true, intent: true },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    );
  });

  it('scopes the query by organisation_id when orgId is supplied', async () => {
    mocks.findMany.mockResolvedValue([]);
    await listAuditEntries(20, 'org-1');
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisation_id: 'org-1' },
        take: 20,
      }),
    );
  });

  it('defaults limit to 50 when called without arguments', async () => {
    mocks.findMany.mockResolvedValue([]);
    await listAuditEntries();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('returns an empty array when prisma rejects (silent fallback)', async () => {
    mocks.findMany.mockRejectedValue(new Error('db down'));
    const out = await listAuditEntries();
    expect(out).toEqual([]);
  });
});

describe('getAuditEntry', () => {
  it('hydrates a row into the AuditEntry shape with ISO timestamps', async () => {
    const created = new Date('2026-05-02T10:00:00.000Z');
    mocks.findUnique.mockResolvedValue({
      id: 'x',
      created_at: created,
      intent: 'i',
      canvas_before: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
      operations: [{ op: 'noop' }],
      raw_response: 'raw',
      parse_success: true,
      schema_validation: { valid: true, errorCount: 0 },
      deploy_dry_run: { success: true, deployableCount: 1 },
      duration_ms: 5,
      model: 'claude-sonnet-4-20250514',
      error: 'oops',
    });

    const out = await getAuditEntry('x');
    expect(out).toEqual({
      id: 'x',
      timestamp: '2026-05-02T10:00:00.000Z',
      intent: 'i',
      canvasBefore: { nodeCount: 0, edgeCount: 0, nodes: [], edges: [] },
      operations: [{ op: 'noop' }],
      rawResponse: 'raw',
      parseSuccess: true,
      schemaValidation: { valid: true, errorCount: 0 },
      deployDryRun: { success: true, deployableCount: 1 },
      durationMs: 5,
      model: 'claude-sonnet-4-20250514',
      error: 'oops',
    });
  });

  it('returns null when no row matches', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await getAuditEntry('missing')).toBeNull();
  });

  it('coalesces a null error column to undefined on read', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 'x',
      created_at: new Date('2026-05-02T10:00:00.000Z'),
      intent: 'i',
      canvas_before: {},
      operations: [],
      raw_response: '',
      parse_success: false,
      schema_validation: null,
      deploy_dry_run: null,
      duration_ms: 0,
      model: 'm',
      error: null,
    });
    const out = await getAuditEntry('x');
    expect(out?.error).toBeUndefined();
    expect(out?.schemaValidation).toBeUndefined();
    expect(out?.deployDryRun).toBeUndefined();
  });

  it('returns null when prisma rejects (silent fallback)', async () => {
    mocks.findUnique.mockRejectedValue(new Error('db down'));
    expect(await getAuditEntry('x')).toBeNull();
  });
});
