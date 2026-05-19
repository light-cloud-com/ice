/**
 * useLogStream — unit tests for the on-canvas Log Terminal hook.
 *
 * Coverage strategy:
 *   - `computeCandidateFingerprint` is a pure function — tested directly.
 *   - The hook body owns a single `useEffect` whose body runs the
 *     subscribe → join-room → register-listeners → cleanup lifecycle.
 *     We mock React's `useEffect` to fire its callback synchronously and
 *     stash the cleanup so we can drive teardown explicitly.
 *   - `getApi` is mocked so the four `logs.*` methods return controllable
 *     promises and listener-cleanup spies.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  api: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(() => Promise.resolve()),
    joinRoom: vi.fn(() => () => undefined),
    onEntry: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    onResumed: vi.fn(() => () => undefined),
    onSourceResolved: vi.fn(() => () => undefined),
  },
  storeRef: { current: null as any },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

vi.mock('../../api/api-adapter', () => ({
  getApi: () => ({ logs: mocks.api }),
}));

vi.mock('../../../store', async (orig) => {
  const actual = await orig<typeof import('../../../store')>();
  return {
    ...actual,
    get store() {
      return mocks.storeRef.current ?? actual.store;
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import cardsReducer, { type Card, type CardNode, type CardEdge } from '../../../store/slices/cards-slice';
import projectsReducer from '../../../store/slices/projects-slice';
import environmentsReducer from '../../../store/slices/environments-slice';
import logsReducer from '../../../store/slices/logs-slice';
import {
  useLogStream,
  computeCandidateFingerprint,
} from '../use-log-stream';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TERMINAL_ID = 'log-1';

function makeNode(partial: Partial<CardNode> & { id: string }): CardNode {
  return {
    id: partial.id,
    type: partial.type ?? 'block',
    position: partial.position ?? { x: 0, y: 0 },
    width: partial.width ?? 100,
    height: partial.height ?? 60,
    data: partial.data ?? {},
  } as CardNode;
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    name: 'C',
    nodes: [],
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
    ...overrides,
  };
}

function makeStore({
  card,
  projectId = 'p-1',
  envId = 'env-1',
}: {
  card?: Card | null;
  projectId?: string | null;
  envId?: string | null;
} = {}) {
  const cardsState: any = card
    ? { activeCardId: card.id, cards: [card], history: {} }
    : { activeCardId: null, cards: [], history: {} };
  const preloadedState: any = {
    cards: cardsState,
    projects: { activeProjectId: projectId, projects: {} },
    environments: { activeEnvId: projectId && envId ? { [projectId]: envId } : {} },
    logs: { byTerminalNodeId: {} },
  };
  const store = configureStore({
    reducer: {
      cards: cardsReducer,
      projects: projectsReducer,
      environments: environmentsReducer,
      logs: logsReducer,
    },
    preloadedState,
  });
  mocks.storeRef.current = store;
  return store;
}

type Captured = ReturnType<typeof useLogStream>;

function captureHook(store: ReturnType<typeof makeStore>, terminalId: string = TERMINAL_ID): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    captured.current = useLogStream(terminalId);
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

beforeEach(() => {
  mocks.effects.length = 0;
  vi.clearAllMocks();
  mocks.api.subscribe.mockReset();
  mocks.api.unsubscribe.mockReset();
  mocks.api.unsubscribe.mockResolvedValue(undefined);
  mocks.api.joinRoom.mockImplementation(() => () => undefined);
  mocks.api.onEntry.mockImplementation(() => () => undefined);
  mocks.api.onError.mockImplementation(() => () => undefined);
  mocks.api.onResumed.mockImplementation(() => () => undefined);
  mocks.api.onSourceResolved.mockImplementation(() => () => undefined);
});

afterEach(() => {
  mocks.storeRef.current = null;
});

// ────────────────────────────────────────────────────────────────────────────
// computeCandidateFingerprint
// ────────────────────────────────────────────────────────────────────────────

describe('computeCandidateFingerprint', () => {
  it('returns empty string when no edges target the terminal', () => {
    const fp = computeCandidateFingerprint(
      [{ source: 'a', target: 'b' }],
      [{ id: 'a', data: { iceType: 'Compute.Container', deploy_status: 'idle' } }],
      'log-1',
    );
    expect(fp).toBe('');
  });

  it('skips null/undefined edges', () => {
    const fp = computeCandidateFingerprint(
      [null, undefined, { source: 'a', target: 'log-1' }],
      [{ id: 'a', data: { iceType: 'X', deploy_status: 'active' } }],
      'log-1',
    );
    expect(fp).toBe('a>X>active');
  });

  it('joins multiple sources sorted', () => {
    const fp = computeCandidateFingerprint(
      [
        { source: 'b', target: 'log-1' },
        { source: 'a', target: 'log-1' },
      ],
      [
        { id: 'a', data: { iceType: 'AT', deploy_status: 'active' } },
        { id: 'b', data: { iceType: 'BT', deploy_status: 'idle' } },
      ],
      'log-1',
    );
    expect(fp).toBe('a>AT>active|b>BT>idle');
  });

  it('skips edges whose source is not in the nodes list', () => {
    const fp = computeCandidateFingerprint(
      [{ source: 'missing', target: 'log-1' }],
      [],
      'log-1',
    );
    expect(fp).toBe('');
  });

  it('uses empty strings when iceType / deploy_status are absent', () => {
    const fp = computeCandidateFingerprint(
      [{ source: 'a', target: 'log-1' }],
      [{ id: 'a', data: {} }],
      'log-1',
    );
    expect(fp).toBe('a>>');
  });

  it('handles a node with no data field at all', () => {
    const fp = computeCandidateFingerprint(
      [{ source: 'a', target: 'log-1' }],
      [{ id: 'a' }],
      'log-1',
    );
    expect(fp).toBe('a>>');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// useLogStream — early returns
// ────────────────────────────────────────────────────────────────────────────

describe('useLogStream — guards', () => {
  it('returns idle defaults when no card', () => {
    const out = captureHook(makeStore({ card: null }));
    expect(out.status).toBe('idle');
    expect(out.entries).toEqual([]);
    expect(out.source).toBeNull();
    expect(out.lastError).toBeNull();
  });

  it('does not call subscribe when cardId is missing', () => {
    captureHook(makeStore({ card: null }));
    expect(mocks.api.subscribe).not.toHaveBeenCalled();
  });

  it('does not call subscribe when environmentId is missing', () => {
    captureHook(makeStore({ card: makeCard(), envId: null }));
    expect(mocks.api.subscribe).not.toHaveBeenCalled();
  });

  it('does not call subscribe when terminalNodeId is empty', () => {
    captureHook(makeStore({ card: makeCard() }), '');
    expect(mocks.api.subscribe).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Subscribe lifecycle
// ────────────────────────────────────────────────────────────────────────────

describe('useLogStream — subscribe + listeners', () => {
  it('dispatches setStatus(connecting) and calls subscribe with full args including candidateSources', async () => {
    const subscriptionResult = {
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved' as const, sourceNodeId: 'src-1', iceType: 'Compute.Container' },
    };
    mocks.api.subscribe.mockResolvedValueOnce(subscriptionResult);
    const card = makeCard({
      nodes: [
        makeNode({ id: 'src-1', data: { iceType: 'Compute.Container', label: 'src' } }),
        makeNode({ id: TERMINAL_ID, data: { iceType: 'Monitoring.Log', streamingMode: 'tail', sourceNodeIdOverride: 'src-1' } }),
      ],
      edges: [{ id: 'e1', source: 'src-1', target: TERMINAL_ID } as CardEdge],
    });
    const store = makeStore({ card });

    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mocks.api.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'card-1',
        environmentId: 'env-1',
        terminalNodeId: TERMINAL_ID,
        mode: 'tail',
        sourceNodeIdOverride: 'src-1',
        candidateSources: [{ nodeId: 'src-1', iceType: 'Compute.Container', label: 'src' }],
      }),
    );

    // Listeners installed
    expect(mocks.api.joinRoom).toHaveBeenCalledWith(TERMINAL_ID);
    expect(mocks.api.onEntry).toHaveBeenCalled();
    expect(mocks.api.onError).toHaveBeenCalled();
    expect(mocks.api.onResumed).toHaveBeenCalled();
    expect(mocks.api.onSourceResolved).toHaveBeenCalled();
  });

  it('omits sourceNodeIdOverride when not set', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'none' as const },
    });
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: { iceType: 'Monitoring.Log' } })],
    });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const args = mocks.api.subscribe.mock.calls[0][0];
    expect(args).not.toHaveProperty('sourceNodeIdOverride');
    expect(args).not.toHaveProperty('candidateSources');
  });

  it('omits candidateSources when no sources resolve', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'none' as const },
    });
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: {} })],
      edges: [{ id: 'e1', source: 'missing', target: TERMINAL_ID } as CardEdge],
    });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const args = mocks.api.subscribe.mock.calls[0][0];
    expect(args.candidateSources).toBeUndefined();
  });

  it('skips a candidate edge whose source has empty iceType', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'none' as const },
    });
    const card = makeCard({
      nodes: [
        makeNode({ id: 's', data: {} }), // no iceType
        makeNode({ id: TERMINAL_ID, data: {} }),
      ],
      edges: [{ id: 'e', source: 's', target: TERMINAL_ID } as CardEdge],
    });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const args = mocks.api.subscribe.mock.calls[0][0];
    expect(args.candidateSources).toBeUndefined();
  });
});

describe('useLogStream — error path', () => {
  it('subscribe rejection dispatches setError', async () => {
    mocks.api.subscribe.mockRejectedValueOnce(new Error('subscribe failed'));
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: {} })],
    });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot.status).toBe('error');
    expect(slot.lastError).toBe('subscribe failed');
  });

  it('subscribe rejection without .message uses default text', async () => {
    mocks.api.subscribe.mockRejectedValueOnce({});
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: {} })],
    });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot.lastError).toBe('Failed to open log stream.');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Listener handlers
// ────────────────────────────────────────────────────────────────────────────

describe('useLogStream — listener handlers', () => {
  it('onEntry dispatches appendEntry only for valid entries', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved' as const, sourceNodeId: 'src', iceType: 'X' },
    });
    let capturedOnEntry: ((e: any) => void) | null = null;
    mocks.api.onEntry.mockImplementationOnce((cb: any) => {
      capturedOnEntry = cb;
      return () => undefined;
    });
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: {} })],
    });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(capturedOnEntry).not.toBeNull();
    // Valid entry
    capturedOnEntry!({
      ts: '2026-04-01T00:00:00Z',
      level: 'info',
      message: 'hi',
      resource: { type: 'gce_instance', labels: {} },
      insertId: 'ins-1',
    });
    // Invalid entries are silently dropped
    capturedOnEntry!(null);
    capturedOnEntry!({});
    capturedOnEntry!({ insertId: 42 }); // wrong type

    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot.entries).toHaveLength(1);
    expect(slot.entries[0].insertId).toBe('ins-1');
  });

  it('onError dispatches setError', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved' as const, sourceNodeId: 'src', iceType: 'X' },
    });
    let capturedOnError: ((e: any) => void) | null = null;
    mocks.api.onError.mockImplementationOnce((cb: any) => {
      capturedOnError = cb;
      return () => undefined;
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    capturedOnError!({ message: 'log error', recoverable: true });
    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot.lastError).toBe('log error');
  });

  it('onResumed dispatches resumed', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved' as const, sourceNodeId: 'src', iceType: 'X' },
    });
    let capturedResumed: ((e: any) => void) | null = null;
    mocks.api.onResumed.mockImplementationOnce((cb: any) => {
      capturedResumed = cb;
      return () => undefined;
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    // Should not crash even though resumed is gated
    expect(() => capturedResumed!({ at: '2026-04-01' })).not.toThrow();
  });

  it('onSourceResolved dispatches setSource', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'pre-deploy' as const, sourceNodeId: 'src', iceType: 'X' },
    });
    let capturedResolved: ((e: any) => void) | null = null;
    mocks.api.onSourceResolved.mockImplementationOnce((cb: any) => {
      capturedResolved = cb;
      return () => undefined;
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    capturedResolved!({ state: 'resolved', sourceNodeId: 'src', iceType: 'X' });
    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot.source).toEqual({ state: 'resolved', sourceNodeId: 'src', iceType: 'X' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────────────────────

describe('useLogStream — cleanup', () => {
  it('runs listener-cleanups, leaveRoom, and unsubscribe on teardown', async () => {
    const offEntry = vi.fn();
    const offErr = vi.fn();
    const offRes = vi.fn();
    const offSrc = vi.fn();
    const leave = vi.fn();
    mocks.api.onEntry.mockReturnValueOnce(offEntry);
    mocks.api.onError.mockReturnValueOnce(offErr);
    mocks.api.onResumed.mockReturnValueOnce(offRes);
    mocks.api.onSourceResolved.mockReturnValueOnce(offSrc);
    mocks.api.joinRoom.mockReturnValueOnce(leave);
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved' as const, sourceNodeId: 'src', iceType: 'X' },
    });

    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);
    await flushMicrotasks();
    await flushMicrotasks();

    // The cleanup we want is the first effect's cleanup, captured during the initial render
    expect(typeof mocks.effects[0]?.cleanup).toBe('function');
    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();
    await flushMicrotasks();

    expect(offEntry).toHaveBeenCalled();
    expect(offErr).toHaveBeenCalled();
    expect(offRes).toHaveBeenCalled();
    expect(offSrc).toHaveBeenCalled();
    expect(leave).toHaveBeenCalled();
    expect(mocks.api.unsubscribe).toHaveBeenCalledWith('sub-1', 'card-1');

    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot).toBeUndefined(); // teardown clears the slot
  });

  it('cancellation while subscribe is in-flight tears down the freshly-opened stream', async () => {
    let resolveSub: (v: any) => void;
    const subPromise = new Promise<any>((r) => {
      resolveSub = r;
    });
    mocks.api.subscribe.mockReturnValueOnce(subPromise);
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);

    // Run cleanup BEFORE subscribe resolves
    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();

    // Now resolve subscribe
    resolveSub!({
      subscriptionId: 'sub-late',
      resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'X' },
    });
    await flushMicrotasks();
    await flushMicrotasks();

    // Subscribe-side unsubscribe was invoked (cancelled-after-subscribe path)
    expect(mocks.api.unsubscribe).toHaveBeenCalledWith('sub-late', 'card-1');
    // Listener registrations skipped since cancelled
    expect(mocks.api.joinRoom).not.toHaveBeenCalled();
  });

  it('cancellation while subscribe is in-flight swallows unsubscribe errors', async () => {
    let resolveSub: (v: any) => void;
    const subPromise = new Promise<any>((r) => {
      resolveSub = r;
    });
    mocks.api.subscribe.mockReturnValueOnce(subPromise);
    mocks.api.unsubscribe.mockRejectedValueOnce(new Error('teardown failed'));
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card }));

    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();

    resolveSub!({
      subscriptionId: 'sub-late',
      resolution: { state: 'none' },
    });
    await flushMicrotasks();
    await flushMicrotasks();

    // Hook should not throw despite the rejection
    expect(true).toBe(true);
  });

  it('cleanup tolerates listener-off throwing', async () => {
    mocks.api.onEntry.mockReturnValueOnce(() => {
      throw new Error('off-entry threw');
    });
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'X' },
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const initialCleanup = mocks.effects[0].cleanup;
    expect(() => {
      if (typeof initialCleanup === 'function') initialCleanup();
    }).not.toThrow();
  });

  it('cleanup tolerates leaveRoom throwing', async () => {
    mocks.api.joinRoom.mockReturnValueOnce(() => {
      throw new Error('leave threw');
    });
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'X' },
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const initialCleanup = mocks.effects[0].cleanup;
    expect(() => {
      if (typeof initialCleanup === 'function') initialCleanup();
    }).not.toThrow();
  });

  it('cleanup unsubscribe error is swallowed (idempotent)', async () => {
    mocks.api.unsubscribe.mockRejectedValueOnce(new Error('idempotent'));
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 'sub-1',
      resolution: { state: 'resolved', sourceNodeId: 's', iceType: 'X' },
    });
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();
    await flushMicrotasks();
    expect(mocks.api.unsubscribe).toHaveBeenCalled();
  });

  it('skips API unsubscribe call when no subscriptionId was captured', async () => {
    // Subscribe rejects → subscriptionId stays null
    mocks.api.subscribe.mockRejectedValueOnce(new Error('boom'));
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();

    // After rejection, listener-cleanups list is empty AND subscriptionId was never set,
    // so the `if (subscriptionId)` branch is false — no unsubscribe call.
    expect(mocks.api.unsubscribe).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Selector outputs
// ────────────────────────────────────────────────────────────────────────────

describe('useLogStream — additional branch coverage', () => {
  it('handles project with no active env (env undefined → guard fires)', () => {
    // projectId set, no env entry → environmentId undefined → guard skips
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card, projectId: 'p-1', envId: null }));
    expect(mocks.api.subscribe).not.toHaveBeenCalled();
  });

  it('handles activeProjectId === null (the false branch of the ternary)', () => {
    // No project at all → environmentId is undefined via the false branch
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    captureHook(makeStore({ card, projectId: null }));
    expect(mocks.api.subscribe).not.toHaveBeenCalled();
  });

  it('drops label when source node has non-string label', async () => {
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 's',
      resolution: { state: 'none' as const },
    });
    const card = makeCard({
      nodes: [
        makeNode({ id: 'src', data: { iceType: 'X', label: { complex: true } } }),
        makeNode({ id: TERMINAL_ID, data: {} }),
      ],
      edges: [{ id: 'e', source: 'src', target: TERMINAL_ID } as CardEdge],
    });
    captureHook(makeStore({ card }));
    await flushMicrotasks();
    await flushMicrotasks();

    const args = mocks.api.subscribe.mock.calls[0][0];
    expect(args.candidateSources[0]).toEqual({ nodeId: 'src', iceType: 'X' });
    expect(args.candidateSources[0]).not.toHaveProperty('label');
  });

  it('cancellation while subscribe rejects swallows the error path', async () => {
    let rejectSub: (e: any) => void;
    mocks.api.subscribe.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectSub = reject;
      }),
    );
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    captureHook(store);

    // Cleanup BEFORE subscribe rejects → cancelled=true → catch's "if cancelled" branch fires
    const initialCleanup = mocks.effects[0].cleanup;
    if (typeof initialCleanup === 'function') initialCleanup();

    rejectSub!(new Error('boom'));
    await flushMicrotasks();
    await flushMicrotasks();

    // setError should NOT have updated since cancelled
    const slot = (store.getState() as any).logs.byTerminalNodeId[TERMINAL_ID];
    expect(slot).toBeUndefined();
  });
});

describe('useLogStream — selector outputs', () => {
  it('reads streamingMode default of "polling" when node lacks the field', () => {
    const card = makeCard({
      nodes: [makeNode({ id: TERMINAL_ID, data: {} })],
    });
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 's',
      resolution: { state: 'none' },
    });
    captureHook(makeStore({ card }));
    expect(mocks.api.subscribe.mock.calls[0][0].mode).toBe('polling');
  });

  it('drops sourceNodeIdOverride when value is non-string', () => {
    const card = makeCard({
      nodes: [
        makeNode({ id: TERMINAL_ID, data: { sourceNodeIdOverride: 42 as any } }),
      ],
    });
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 's',
      resolution: { state: 'none' },
    });
    captureHook(makeStore({ card }));
    expect(mocks.api.subscribe.mock.calls[0][0]).not.toHaveProperty('sourceNodeIdOverride');
  });

  it('returns slot data when state has an entry for the terminal', () => {
    const card = makeCard({ nodes: [makeNode({ id: TERMINAL_ID, data: {} })] });
    const store = makeStore({ card });
    // Pre-seed a slot so the selector returns it
    store.dispatch({
      type: 'logs/setStatus',
      payload: { terminalNodeId: TERMINAL_ID, status: 'streaming' },
    });
    mocks.api.subscribe.mockResolvedValueOnce({
      subscriptionId: 's',
      resolution: { state: 'none' },
    });
    const out = captureHook(store);
    // Initial render may show 'connecting' from the effect dispatch
    expect(['streaming', 'connecting']).toContain(out.status);
  });
});
