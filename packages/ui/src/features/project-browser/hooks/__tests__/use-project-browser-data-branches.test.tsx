/**
 * useProjectBrowserData — branch coverage suite.
 *
 * The capture-ref Probe in `use-project-browser-data.test.tsx` covers the
 * happy path but cannot drive useState-dependent branches because the SSR
 * renderer doesn't re-render. This file mocks react.useState/useEffect/
 * useCallback so we can:
 *   - capture the localStorage-seed initializer and exercise its catch arm,
 *   - run fetchProjects against success/error/search-set responses,
 *   - replay the persistence useEffect to assert the localStorage write,
 *   - replay the toggleExpand updater for both add and remove arms,
 *   - replay the response-shape branch (truthy vs missing res.data).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  // useState slot table — items, flatFolders, loading, expanded, search
  itemsRef: { current: [] as Array<{ id: string; type: string; children?: unknown[] }> },
  flatRef: { current: [] as Array<{ id: string; type: string }> },
  loadingRef: { current: false as boolean },
  expandedRef: { current: new Set<string>() },
  searchRef: { current: '' as string },
  setItemsSpy: vi.fn(),
  setFlatSpy: vi.fn(),
  setLoadingSpy: vi.fn(),
  setExpandedSpy: vi.fn(),
  setSearchSpy: vi.fn(),
  // useState initializer for expanded — captured for direct invocation
  expandedInitializer: null as null | (() => Set<string>),
  // useEffect callbacks captured in source order:
  //   [0]=persist expanded, [1]=fetchProjects on dep change
  effectCallbacks: [] as Array<() => void | (() => void)>,
  effectDeps: [] as unknown[][],
  // useCallback registrations: [0]=fetchProjects, [1]=toggleExpand
  callbackFns: [] as Array<(...args: unknown[]) => unknown>,
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  let useStateIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    useStateIdx = 0;
  };
  const dispatchTable = [
    () => [mocks.itemsRef.current, mocks.setItemsSpy] as const,
    () => [mocks.flatRef.current, mocks.setFlatSpy] as const,
    () => [mocks.loadingRef.current, mocks.setLoadingSpy] as const,
    // expanded — capture the lazy init fn so we can exercise it.
    null as unknown as () => readonly [unknown, unknown],
    () => [mocks.searchRef.current, mocks.setSearchSpy] as const,
  ];
  const useState = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const idx = useStateIdx;
    useStateIdx += 1;
    if (idx === 3) {
      // expanded slot — capture initializer if it's a function.
      if (typeof init === 'function') {
        mocks.expandedInitializer = init as unknown as () => Set<string>;
      }
      return [mocks.expandedRef.current as unknown as T, mocks.setExpandedSpy as unknown as (v: T) => void];
    }
    const slot = dispatchTable[idx] ?? (() => [init, vi.fn()] as const);
    return slot() as unknown as [T, (v: T) => void];
  };
  const useEffect = (cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effectCallbacks.push(cb);
    mocks.effectDeps.push(deps ?? []);
  };
  const useCallback = <T extends (...args: never[]) => unknown>(fn: T, _deps: unknown[]): T => {
    mocks.callbackFns.push(fn as unknown as (...args: unknown[]) => unknown);
    return fn;
  };
  return {
    ...r,
    useState,
    useEffect,
    useCallback,
  };
});

import { useProjectBrowserData } from '../use-project-browser-data';

beforeEach(() => {
  mocks.axiosPost.mockReset();
  mocks.itemsRef.current = [];
  mocks.flatRef.current = [];
  mocks.loadingRef.current = false;
  mocks.expandedRef.current = new Set<string>();
  mocks.searchRef.current = '';
  mocks.setItemsSpy.mockReset();
  mocks.setFlatSpy.mockReset();
  mocks.setLoadingSpy.mockReset();
  mocks.setExpandedSpy.mockReset();
  mocks.setSearchSpy.mockReset();
  mocks.expandedInitializer = null;
  mocks.effectCallbacks.length = 0;
  mocks.effectDeps.length = 0;
  mocks.callbackFns.length = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  // Default localStorage stubs with a fresh in-memory store
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((k: string) => (k in store ? store[k] : null)),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k];
    }),
  });
});

const callHook = (orgId: string | undefined) => useProjectBrowserData(orgId);

describe('useProjectBrowserData — expanded localStorage seed', () => {
  it('seeds expanded from localStorage when JSON is valid', () => {
    (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem(
      'ice-project-expanded',
      JSON.stringify(['foo', 'bar']),
    );
    callHook('o1');
    expect(mocks.expandedInitializer).not.toBeNull();
    const seeded = mocks.expandedInitializer!();
    expect([...seeded]).toEqual(['foo', 'bar']);
  });

  it('seeds an empty Set when localStorage is empty', () => {
    callHook('o1');
    const seeded = mocks.expandedInitializer!();
    expect(seeded.size).toBe(0);
  });

  it('falls back to an empty Set when JSON.parse throws', () => {
    (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem(
      'ice-project-expanded',
      'not-valid-json',
    );
    callHook('o1');
    const seeded = mocks.expandedInitializer!();
    expect(seeded.size).toBe(0);
  });

  it('falls back to an empty Set when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(),
    });
    callHook('o1');
    const seeded = mocks.expandedInitializer!();
    expect(seeded.size).toBe(0);
  });
});

describe('useProjectBrowserData — persistence useEffect', () => {
  it('writes the expanded set to localStorage when the effect fires', () => {
    mocks.expandedRef.current = new Set(['x', 'y']);
    callHook('o1');
    // The first useEffect is the persistence effect (deps: [expanded]).
    expect(mocks.effectCallbacks[0]).toBeDefined();
    mocks.effectCallbacks[0]();
    expect((globalThis.localStorage as unknown as { setItem: ReturnType<typeof vi.fn> }).setItem).toHaveBeenCalledWith(
      'ice-project-expanded',
      JSON.stringify(['x', 'y']),
    );
  });
});

describe('useProjectBrowserData — fetchProjects', () => {
  it('returns early without an axios call when orgId is undefined', async () => {
    callHook(undefined);
    const fetchProjects = mocks.callbackFns[0] as () => Promise<void>;
    await fetchProjects();
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    // setLoading should not flip true either
    expect(mocks.setLoadingSpy).not.toHaveBeenCalled();
  });

  it('flips loading on, fetches, and writes items+flatFolders on success', async () => {
    const flat = [
      { id: 'r', name: 'Root', type: 'folder', parent_id: null, cards: [] },
      { id: 'c', name: 'Child', type: 'project', parent_id: 'r', cards: [] },
    ];
    mocks.axiosPost.mockResolvedValueOnce({ data: flat });
    callHook('o1');
    const fetchProjects = mocks.callbackFns[0] as () => Promise<void>;
    await fetchProjects();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects', { organisationId: 'o1' });
    expect(mocks.setLoadingSpy).toHaveBeenCalledWith(true);
    expect(mocks.setFlatSpy).toHaveBeenCalled();
    const flatArg = mocks.setFlatSpy.mock.calls[0][0] as Array<{ type: string }>;
    expect(flatArg).toHaveLength(1);
    expect(flatArg[0].type).toBe('folder');
    expect(mocks.setItemsSpy).toHaveBeenCalled();
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
  });

  it('includes search in the post body when present', async () => {
    mocks.searchRef.current = 'foo';
    mocks.axiosPost.mockResolvedValueOnce({ data: [] });
    callHook('o1');
    const fetchProjects = mocks.callbackFns[0] as () => Promise<void>;
    await fetchProjects();
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects', {
      organisationId: 'o1',
      search: 'foo',
    });
  });

  it('coerces undefined res.data to an empty array (the `|| []` arm)', async () => {
    mocks.axiosPost.mockResolvedValueOnce({});
    callHook('o1');
    const fetchProjects = mocks.callbackFns[0] as () => Promise<void>;
    await fetchProjects();
    expect(mocks.setFlatSpy).toHaveBeenCalledWith([]);
  });

  it('clears items to [] when the request rejects', async () => {
    mocks.axiosPost.mockRejectedValueOnce(new Error('boom'));
    callHook('o1');
    const fetchProjects = mocks.callbackFns[0] as () => Promise<void>;
    await fetchProjects();
    expect(mocks.setItemsSpy).toHaveBeenCalledWith([]);
    expect(mocks.setLoadingSpy).toHaveBeenLastCalledWith(false);
  });

  it('autoreruns fetchProjects via the [fetchProjects] useEffect', async () => {
    mocks.axiosPost.mockResolvedValue({ data: [] });
    callHook('o1');
    // Second useEffect is fetchProjects auto-rerun
    expect(mocks.effectCallbacks[1]).toBeDefined();
    mocks.effectCallbacks[1]();
    // Microtask flush
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.axiosPost).toHaveBeenCalled();
  });
});

describe('useProjectBrowserData — toggleExpand', () => {
  it('add arm: invoking the updater on a missing id yields a new Set with that id', () => {
    callHook('o1');
    const toggleExpand = mocks.callbackFns[1] as (id: string) => void;
    toggleExpand('foo');
    // setExpanded is called with a function — the updater
    expect(mocks.setExpandedSpy).toHaveBeenCalled();
    const updater = mocks.setExpandedSpy.mock.calls[0][0] as (prev: Set<string>) => Set<string>;
    const result = updater(new Set<string>(['existing']));
    expect([...result].sort()).toEqual(['existing', 'foo']);
  });

  it('remove arm: invoking the updater on a present id yields a new Set without it', () => {
    callHook('o1');
    const toggleExpand = mocks.callbackFns[1] as (id: string) => void;
    toggleExpand('foo');
    const updater = mocks.setExpandedSpy.mock.calls[0][0] as (prev: Set<string>) => Set<string>;
    const result = updater(new Set<string>(['foo', 'bar']));
    expect([...result].sort()).toEqual(['bar']);
  });

  it('returns a NEW Set, not the same reference', () => {
    callHook('o1');
    const toggleExpand = mocks.callbackFns[1] as (id: string) => void;
    toggleExpand('foo');
    const updater = mocks.setExpandedSpy.mock.calls[0][0] as (prev: Set<string>) => Set<string>;
    const prev = new Set<string>(['existing']);
    const next = updater(prev);
    expect(next).not.toBe(prev);
  });
});
