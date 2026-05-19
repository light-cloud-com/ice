/**
 * useResolvePath — resolves a URL path into folder/project IDs.
 *
 * Test strategy:
 *   - Mock React's `useEffect` so the cb fires synchronously and the
 *     resolve() promise we await drives all branches.
 *   - Mock React's `useState` to capture the latest result the SUT
 *     would render with — `renderToString` does not re-render on
 *     setState, so the only observation point for async-resolved state
 *     is the captured setter argument.
 *   - Mock `axiosInstance.post` to return controllable item lists.
 *
 * Branches under test:
 *   - empty path
 *   - selectedOrg + matching first segment (org slug stripped)
 *   - selectedOrg + non-matching first segment (treated as path)
 *   - community edition (no selectedOrg) — all segments are path
 *   - resolves a folder, drills into a project
 *   - PROJECT_SUBPAGES short-circuit (settings/deploy/.../table)
 *   - axiosInstance.post throws → catch swallows
 *   - notFound when no breadcrumbs
 *   - cancellation — cleanup runs before resolve completes
 */

import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  axiosPost: vi.fn(),
  effectFired: { value: false },
  latestState: { current: null as unknown },
  setterCalls: [] as Array<unknown>,
}));

// Mock useEffect + useState to play nicely with renderToString.
// useEffect fires once (no re-trigger on state changes inside the
// async resolve). useState wraps the setter so setResult arguments
// are observable from outside the renderToString phase.
vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      if (mocks.effectFired.value) return;
      mocks.effectFired.value = true;
      const cleanup = cb();
      mocks.effects.push({ cb, cleanup });
    },
    useState: <T,>(initial: T | (() => T)) => {
      const init = typeof initial === 'function' ? (initial as () => T)() : initial;
      mocks.latestState.current = init;
      return [
        init,
        (next: T | ((prev: T) => T)) => {
          const computed = typeof next === 'function' ? (next as (prev: T) => T)(mocks.latestState.current as T) : next;
          mocks.latestState.current = computed;
          mocks.setterCalls.push(computed);
        },
      ];
    },
  };
});

vi.mock('../../api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import { useResolvePath } from '../use-resolve-path';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface AccountState {
  user: { organisations: { id: string; name: string }[] } | null;
  selectedOrg: { id: string; name: string } | null;
}

function makeStore(state: AccountState) {
  const accountSlice = createSlice({
    name: 'account',
    initialState: state,
    reducers: {},
  });
  return configureStore({
    reducer: { account: accountSlice.reducer } as any,
    preloadedState: { account: state } as any,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function mountHook(segments: string[], store: ReturnType<typeof makeStore>) {
  const Probe: React.FC = () => {
    useResolvePath(segments);
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
}

interface ResolvedPath {
  loading: boolean;
  type: string;
  id: string | null;
  name: string;
  subpage: string;
  breadcrumbs: { label: string; path: string }[];
  orgPrefix: string;
}

function latest(): ResolvedPath {
  return mocks.latestState.current as ResolvedPath;
}

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.axiosPost.mockReset();
  mocks.effectFired.value = false;
  mocks.latestState.current = null;
  mocks.setterCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────

describe('useResolvePath — early returns', () => {
  it('returns root state for empty path', () => {
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook([], store);
    expect(latest().type).toBe('root');
    expect(latest().id).toBeNull();
    expect(latest().loading).toBe(false);
  });

  it('returns root state when selectedOrg matches first segment and no other segments', () => {
    const store = makeStore({
      user: { organisations: [{ id: 'o1', name: 'Acme Corp' }] },
      selectedOrg: { id: 'o1', name: 'Acme Corp' },
    });
    mountHook(['acme-corp'], store);
    expect(latest().type).toBe('root');
    expect(latest().orgPrefix).toBe('/acme-corp');
  });

  it('reports orgPrefix as "" in community edition', () => {
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook([], store);
    expect(latest().orgPrefix).toBe('');
  });
});

describe('useResolvePath — community-edition path (no selectedOrg)', () => {
  it('treats all segments as the path and resolves to project', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'p1', name: 'My Project', slug: 'my-project', type: 'project' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['my-project'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('project');
    expect(latest().id).toBe('p1');
    expect(latest().name).toBe('My Project');
  });

  it('hits axios.post WITHOUT organisationId when community edition', async () => {
    mocks.axiosPost.mockResolvedValue({ data: [] });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['unknown'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    const body = mocks.axiosPost.mock.calls[0]?.[1] as { organisationId?: string };
    expect(body).not.toHaveProperty('organisationId');
  });
});

describe('useResolvePath — platform-edition path (with selectedOrg)', () => {
  it('strips matched org slug and resolves the rest', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'p1', name: 'Project', slug: 'project', type: 'project' }],
    });
    const store = makeStore({
      user: { organisations: [{ id: 'o1', name: 'Acme Corp' }] },
      selectedOrg: { id: 'o1', name: 'Acme Corp' },
    });
    mountHook(['acme-corp', 'project'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    const body = mocks.axiosPost.mock.calls[0]?.[1] as { organisationId?: string };
    expect(body.organisationId).toBe('o1');
  });

  it('treats first segment as path when it does NOT match the org slug', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'p1', name: 'Project', slug: 'project', type: 'project' }],
    });
    const store = makeStore({
      user: { organisations: [{ id: 'o1', name: 'Acme' }] },
      selectedOrg: { id: 'o1', name: 'Acme' },
    });
    mountHook(['project'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(mocks.axiosPost).toHaveBeenCalled();
  });
});

describe('useResolvePath — folder + project drill-down', () => {
  it('drills folder → project, building breadcrumbs', async () => {
    mocks.axiosPost
      .mockResolvedValueOnce({
        data: [{ id: 'f1', name: 'Folder', slug: 'folder', type: 'folder' }],
      })
      .mockResolvedValueOnce({
        data: [{ id: 'p1', name: 'Project', slug: 'project', type: 'project' }],
      });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['folder', 'project'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('project');
    expect(latest().breadcrumbs).toEqual([
      { label: 'Folder', path: '/folder' },
      { label: 'Project', path: '/folder/project' },
    ]);
  });

  it('matches by slug fallback to slugified name', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'p1', name: 'My Project', slug: 'something-else', type: 'project' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['my-project'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('project');
  });
});

describe('useResolvePath — PROJECT_SUBPAGES handling', () => {
  it('detects "settings" as a subpage after resolving a project', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Project', slug: 'project', type: 'project' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['project', 'settings'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().subpage).toBe('settings');
    expect(latest().type).toBe('project');
  });

  it('detects "deploy" subpage', async () => {
    mocks.axiosPost.mockResolvedValueOnce({
      data: [{ id: 'p1', name: 'Project', slug: 'project', type: 'project' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['project', 'deploy'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().subpage).toBe('deploy');
  });

  it('does NOT treat known subpages as subpage when type is folder', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'f1', name: 'Folder', slug: 'folder', type: 'folder' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['folder', 'settings'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(mocks.axiosPost).toHaveBeenCalledTimes(2);
  });
});

describe('useResolvePath — error handling', () => {
  it('catches axios errors and yields notFound when no breadcrumbs', async () => {
    mocks.axiosPost.mockRejectedValue(new Error('500'));
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['some-segment'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('notFound');
    expect(latest().loading).toBe(false);
  });

  it('breaks the loop and resolves notFound when the segment is not found', async () => {
    mocks.axiosPost.mockResolvedValue({
      data: [{ id: 'p1', name: 'Other', slug: 'other', type: 'project' }],
    });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['nonexistent'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('notFound');
  });

  it('partial-resolve: first segment matches, second fails → returns folder type', async () => {
    mocks.axiosPost
      .mockResolvedValueOnce({
        data: [{ id: 'f1', name: 'Folder', slug: 'folder', type: 'folder' }],
      })
      .mockResolvedValueOnce({
        data: [],
      });
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['folder', 'missing'], store);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(latest().type).toBe('folder');
    expect(latest().id).toBe('f1');
  });
});

describe('useResolvePath — cancellation', () => {
  it('cleanup sets cancelled=true so a pending resolve does not setResult', async () => {
    let resolver: ((v: { data: unknown[] }) => void) | undefined;
    mocks.axiosPost.mockImplementation(
      () =>
        new Promise((res) => {
          resolver = res;
        }),
    );
    const store = makeStore({ user: null, selectedOrg: null });
    mountHook(['something'], store);
    // Cancel right away
    const cleanup = mocks.effects[0].cleanup as () => void;
    cleanup();
    // Then resolve the in-flight call. The setter should NOT be called
    // with anything outside of the setLoading-true entry, because
    // cancelled=true blocks the final setResult call.
    const setterCallsBefore = mocks.setterCalls.length;
    if (resolver) resolver({ data: [{ id: 'x', name: 'x', slug: 'something', type: 'project' }] });
    await flushMicrotasks();
    await flushMicrotasks();
    // After cancellation, no further setResult calls fire.
    expect(mocks.setterCalls.length).toBe(setterCallsBefore);
  });
});
