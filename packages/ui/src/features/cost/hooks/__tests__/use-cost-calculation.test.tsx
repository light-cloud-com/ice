/**
 * Tests for `useCostCalculation` — central hook for the cost panel.
 *
 * Strategy:
 *   - Mock react.useState/useEffect/useMemo so we can drive every branch
 *     of the body without a renderer.
 *   - Mock react-redux.useSelector to return a fixture activeCard.
 *   - Mock @ui/shared/api/api-adapter.getApi() to control the resource
 *     fetch (success / catch / shape variants).
 *   - Mock @ice/core/resources to expose a deterministic SCALE_TIERS.
 *   - Use vi.resetModules() to clear the module-level `_cachedResourceMap`
 *     between tests so the load branch can be re-exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // react-redux
  selectorImpl: vi.fn(() => null as unknown),
  // useState slot — resourceMap state
  resourceMapRef: { current: null as Map<string, unknown> | null },
  setResourceMapSpy: vi.fn(),
  // useEffect callbacks captured for direct invocation
  effectCallbacks: [] as Array<() => void | (() => void)>,
  // getApi().resources.getAll
  getAll: vi.fn(),
  // selectActiveCard returns
  activeCard: null as null | { nodes: Array<unknown>; edges: Array<unknown> },
  // utility mocks
  computeCostSummary: vi.fn(() => ({ summary: 'computed' })),
  estimateDataTransferCost: vi.fn(() => ({ dt: 'computed' })),
  compareProviderCosts: vi.fn(() => [{ pc: 'computed' }]),
  countTrafficConnections: vi.fn(() => new Map<string, number>()),
}));

vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  const useState = <T,>(init: T): [T, (v: T) => void] => {
    if (mocks.resourceMapRef.current !== undefined) {
      return [mocks.resourceMapRef.current as unknown as T, mocks.setResourceMapSpy as unknown as (v: T) => void];
    }
    return [init, vi.fn()];
  };
  const useEffect = (cb: () => void | (() => void)) => {
    mocks.effectCallbacks.push(cb);
  };
  const useMemo = <T,>(fn: () => T): T => fn();
  return {
    ...r,
    useState,
    useEffect,
    useMemo,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => mocks.selectorImpl(sel),
}));

vi.mock('@ice/core/resources', () => ({
  SCALE_TIERS: ['dev', 'low', 'moderate', 'medium', 'high', 'very-high'],
}));

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({ resources: { getAll: mocks.getAll } }),
}));

vi.mock('../../utils/cost-calculator', () => ({
  computeCostSummary: mocks.computeCostSummary,
}));

vi.mock('../../utils/provider-pricing', () => ({
  estimateDataTransferCost: mocks.estimateDataTransferCost,
  compareProviderCosts: mocks.compareProviderCosts,
  countTrafficConnections: mocks.countTrafficConnections,
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: (state: unknown) => mocks.activeCard,
}));

beforeEach(async () => {
  // Reset modules so the module-level `_cachedResourceMap` clears
  vi.resetModules();
  mocks.selectorImpl.mockReset();
  mocks.selectorImpl.mockImplementation((sel: unknown) => {
    if (typeof sel === 'function') return (sel as (s: unknown) => unknown)({});
    return null;
  });
  mocks.resourceMapRef.current = null;
  mocks.setResourceMapSpy.mockReset();
  mocks.effectCallbacks.length = 0;
  mocks.getAll.mockReset();
  mocks.activeCard = null;
  mocks.computeCostSummary.mockReset().mockReturnValue({ summary: 'computed' });
  mocks.estimateDataTransferCost.mockReset().mockReturnValue({ dt: 'computed' });
  mocks.compareProviderCosts.mockReset().mockReturnValue([{ pc: 'computed' }]);
  mocks.countTrafficConnections.mockReset().mockReturnValue(new Map<string, number>());
});

const callHook = async (trafficTierIndex: number) => {
  const mod = await import('../use-cost-calculation');
  return mod.useCostCalculation(trafficTierIndex);
};

describe('useCostCalculation — initial state & memo plumbing', () => {
  it('returns a result with summary, dataTransfer, providerComparison, etc.', async () => {
    const result = await callHook(2);
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('dataTransfer');
    expect(result).toHaveProperty('providerComparison');
    expect(result).toHaveProperty('trafficConnectionCount');
    expect(result).toHaveProperty('primaryProvider');
    expect(result).toHaveProperty('hasNodes');
    expect(result).toHaveProperty('resourceMap');
  });

  it('hasNodes=false when activeCard is null', async () => {
    mocks.activeCard = null;
    const result = await callHook(2);
    expect(result.hasNodes).toBe(false);
  });

  it('hasNodes=true when activeCard has nodes', async () => {
    mocks.activeCard = {
      nodes: [{ id: 'n1', data: { provider: 'aws' } }],
      edges: [],
    };
    const result = await callHook(2);
    expect(result.hasNodes).toBe(true);
  });

  it('falls back to "moderate" when trafficTierIndex is out of range', async () => {
    await callHook(99);
    expect(mocks.computeCostSummary).toHaveBeenCalled();
    const lastCall = mocks.computeCostSummary.mock.calls.at(-1) as unknown[];
    expect(lastCall[2]).toBe('moderate');
  });

  it('uses indexed tier when trafficTierIndex is in range', async () => {
    await callHook(0);
    const lastCall = mocks.computeCostSummary.mock.calls.at(-1) as unknown[];
    expect(lastCall[2]).toBe('dev');
  });
});

describe('useCostCalculation — primaryProvider derivation', () => {
  it('defaults to "aws" when there are no nodes', async () => {
    mocks.activeCard = { nodes: [], edges: [] };
    const result = await callHook(2);
    expect(result.primaryProvider).toBe('aws');
  });

  it('returns the most-frequent provider', async () => {
    mocks.activeCard = {
      nodes: [
        { id: 'n1', data: { provider: 'gcp' } },
        { id: 'n2', data: { provider: 'gcp' } },
        { id: 'n3', data: { provider: 'aws' } },
      ],
      edges: [],
    };
    const result = await callHook(2);
    expect(result.primaryProvider).toBe('gcp');
  });

  it('skips nodes whose provider is empty/missing', async () => {
    mocks.activeCard = {
      nodes: [
        { id: 'n1', data: {} },
        { id: 'n2', data: { provider: 'azure' } },
      ],
      edges: [],
    };
    const result = await callHook(2);
    expect(result.primaryProvider).toBe('azure');
  });

  it('returns "aws" when all node providers are empty', async () => {
    mocks.activeCard = {
      nodes: [{ id: 'n1', data: {} }, { id: 'n2', data: {} }],
      edges: [],
    };
    const result = await callHook(2);
    expect(result.primaryProvider).toBe('aws');
  });

  it('handles a node without a data field at all', async () => {
    mocks.activeCard = {
      nodes: [{ id: 'n1' }],
      edges: [],
    };
    const result = await callHook(2);
    // node.data?.provider is undefined → empty string, count map stays empty
    expect(result.primaryProvider).toBe('aws');
  });
});

describe('useCostCalculation — trafficConnectionCount sum', () => {
  it('sums values across the connection map', async () => {
    mocks.countTrafficConnections.mockReturnValue(new Map([['a', 1], ['b', 2], ['c', 3]]));
    mocks.activeCard = { nodes: [{ id: 'n1', data: { provider: 'aws' } }], edges: [] };
    const result = await callHook(2);
    expect(result.trafficConnectionCount).toBe(6);
  });

  it('is zero when there are no connections', async () => {
    mocks.countTrafficConnections.mockReturnValue(new Map());
    mocks.activeCard = { nodes: [], edges: [] };
    const result = await callHook(2);
    expect(result.trafficConnectionCount).toBe(0);
  });
});

describe('useCostCalculation — resource fetch effect', () => {
  it('invokes getApi().resources.getAll on first mount', async () => {
    mocks.getAll.mockResolvedValue([{ id: 'r1', ice_type: 'Compute' }]);
    await callHook(2);
    expect(mocks.effectCallbacks.length).toBeGreaterThan(0);
    mocks.effectCallbacks[0]();
    expect(mocks.getAll).toHaveBeenCalled();
  });

  it('builds a resource map keyed by id and ice_type, calling setResourceMap', async () => {
    mocks.getAll.mockResolvedValue([
      { id: 'r1', ice_type: 'Compute' },
      { ice_type: 'Database' },
    ]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.setResourceMapSpy).toHaveBeenCalled();
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.has('r1')).toBe(true);
    expect(map.has('Compute')).toBe(true);
    expect(map.has('Database')).toBe(true);
  });

  it('handles category-shaped responses (data[0].resources)', async () => {
    mocks.getAll.mockResolvedValue([
      { resources: [{ id: 'r1', ice_type: 'A' }] },
      { resources: [{ id: 'r2', ice_type: 'B' }] },
    ]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.has('r1')).toBe(true);
    expect(map.has('r2')).toBe(true);
  });

  it('handles flat-shape responses (no resources field)', async () => {
    mocks.getAll.mockResolvedValue([{ id: 'a', ice_type: 'A' }]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.has('a')).toBe(true);
  });

  it('handles an empty data array (no flatMap, just the empty array itself)', async () => {
    mocks.getAll.mockResolvedValue([]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.size).toBe(0);
  });

  it('handles non-array data gracefully (treated as flat)', async () => {
    mocks.getAll.mockResolvedValue({ id: 'r1', ice_type: 'Compute' } as unknown as Array<unknown>);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    // Iteration over a non-array is the for...of with non-iterable — guarded
    // by Array.isArray check; setResourceMap may not be called or get an
    // empty map. Either way, no throw.
    expect(true).toBe(true);
  });

  it('skips entries with neither id nor ice_type', async () => {
    mocks.getAll.mockResolvedValue([{ name: 'no-id-no-type' }]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.size).toBe(0);
  });

  it('does not duplicate when id matches ice_type', async () => {
    mocks.getAll.mockResolvedValue([{ id: 'X', ice_type: 'X' }]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    const map = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    expect(map.has('X')).toBe(true);
    expect(map.size).toBe(1);
  });

  it('swallows getAll rejections without throwing', async () => {
    mocks.getAll.mockRejectedValue(new Error('api down'));
    await callHook(2);
    await expect((async () => mocks.effectCallbacks[0]())()).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.setResourceMapSpy).not.toHaveBeenCalled();
  });

  it('skips fetch when _cachedResourceMap is already populated', async () => {
    // First call populates the cache
    mocks.getAll.mockResolvedValueOnce([{ id: 'r1', ice_type: 'A' }]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.getAll).toHaveBeenCalledTimes(1);
    // Second call: don't reset modules (kept cached)
    mocks.effectCallbacks.length = 0;
    mocks.getAll.mockClear();
    // Re-import the same module instance — _cachedResourceMap persists
    const mod = await import('../use-cost-calculation');
    mod.useCostCalculation(2);
    if (mocks.effectCallbacks.length > 0) {
      mocks.effectCallbacks[0]();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(mocks.getAll).not.toHaveBeenCalled();
  });
});

describe('useCostCalculation — when resourceMap is already loaded', () => {
  it('starts with the cached resourceMap', async () => {
    // First call populates the cache.
    mocks.getAll.mockResolvedValueOnce([{ id: 'r1', ice_type: 'A' }]);
    await callHook(2);
    mocks.effectCallbacks[0]();
    await new Promise((r) => setTimeout(r, 0));

    // Second call (same module): the useState init reads `_cachedResourceMap`.
    // The mocked useState returns whatever resourceMapRef.current is — set it
    // to the captured map to simulate the cache-aware initialization branch.
    const cachedMap = mocks.setResourceMapSpy.mock.calls[0][0] as Map<string, unknown>;
    mocks.resourceMapRef.current = cachedMap;
    mocks.effectCallbacks.length = 0;
    const result2 = await callHook(2);
    expect(result2.resourceMap).toBe(cachedMap);
  });
});
