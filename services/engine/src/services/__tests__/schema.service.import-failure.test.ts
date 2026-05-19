/**
 * Tests for schema.service.ts's catch arm — the load-failure fallback at
 * lines 13-15. We separate this into its own file because `vi.mock` is
 * hoisted before the resetModules cycle and a throwing factory would
 * persist across all tests in the file. Isolating to a single test file
 * with one assertion lets us cover that specific branch.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/core', () => {
  throw new Error('synthetic core load failure');
});

describe('schema service — @ice/core load failure', () => {
  it('falls back to {HIGH_LEVEL_CATEGORIES:[], getAllHighLevelResources:fn} when the import itself rejects', async () => {
    // The SUT's `try { _core = await import('@ice/core') } catch { ... }`
    // sets a stub. getCategories should then yield [].
    const svc = await import('../schema.service');
    expect(await svc.getCategories()).toEqual([]);
    // querySchemas reads getAllHighLevelResources from the stub (returns []).
    expect(await svc.querySchemas({})).toEqual([]);
    // getSchema also walks getAllHighLevelResources — returns null for any id.
    expect(await svc.getSchema('any')).toBeNull();
  });
});
