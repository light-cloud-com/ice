/**
 * rf-pdpl-21 — useDeployEffects hook.
 *
 * Four `useEffect` blocks lifted from `deploy-panel.tsx`:
 *   1. Logs auto-scroll (unconditional — RISK #6).
 *   2. Provider auto-detect + load deployed resources + auto-fill GCP project.
 *   3. Listen for `requirement_verified` deploy events.
 *   4. Hydrate deploy results from history (RISK #1: "Don't gate on slice
 *      status here" docstring is load-bearing).
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * `@testing-library/react`). The harness mocks React's `useEffect`
 * synchronously so the effect bodies run inside `renderToString`, and
 * stashes each effect's `(cb, deps)` pair into `mocks.effectsByDeps` so
 * tests can identify the four registered effects by their dep-array
 * shape (the auto-scroll effect has a single-number dep; the other three
 * have multi-element deps that include `dispatch`).
 *
 * The async-IIFE bodies inside effects 2 and 4 fire dispatches at
 * different points in their promise chains; tests await `flushMicrotasks`
 * to drain pending then-handlers before asserting on `dispatchSpy`.
 *
 * The captured cleanup functions for effects 3 and 4 are stashed in
 * `mocks.effectCleanups` (parallel to the rf-canv-18/23 pattern) so
 * cleanup-branch tests can invoke them manually.
 */

import { configureStore } from '@reduxjs/toolkit';
import React, { useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Microtask flush — equivalent to setImmediate but works in Node + browser.
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// `effectsByDeps` mirrors the rf-canv-23 sync-useEffect mock pattern: every
// render appends a `(cb, deps)` entry; tests find the effect they care about
// by dep-array length / shape and invoke its cb manually when needed.

interface CapturedEffect {
  cb: () => void | (() => void);
  deps: unknown[] | undefined;
  cleanup: void | (() => void);
}

const mocks = vi.hoisted(() => ({
  effects: [] as CapturedEffect[],
  // Toggle: when false, useEffect is a no-op (skips firing in renderToString).
  // Default true — every test in this file exercises an effect body.
  syncUseEffect: { current: true as boolean },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
      if (!mocks.syncUseEffect.current) return;
      const cleanup = cb();
      mocks.effects.push({ cb, deps, cleanup });
    }),
  };
});

// ─── getApi mock ────────────────────────────────────────────────────────────
// The hook calls four endpoints: deploy.getResources, deploy.getDeployments,
// provider.isConnected, provider.getProjects, plus onDeployEvent.

const mockDeployApi = {
  getResources: vi.fn(),
  getDeployments: vi.fn(),
};
const mockProviderApi = {
  isConnected: vi.fn(),
  getProjects: vi.fn(),
};
const mockOnDeployEvent = vi.fn();

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    deploy: mockDeployApi,
    provider: mockProviderApi,
    onDeployEvent: mockOnDeployEvent,
  }),
}));

// ─── Imports after mocks ────────────────────────────────────────────────────

import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import deployReducer, { type DeployState } from '../../../../store/slices/deploy-slice';
import { useDeployEffects, type UseDeployEffectsReturn } from '../use-deploy-effects';

// ─── Store + capture helpers ────────────────────────────────────────────────

const makeStore = () =>
  configureStore({
    reducer: {
      deploy: deployReducer,
      cards: cardsReducer,
    },
  });

type TestStore = ReturnType<typeof makeStore>;

const ACTIVE_CARD: Card = {
  id: 'card-1',
  name: 'Test card',
  nodes: [
    { id: 'n1', type: 'resource', position: { x: 0, y: 0 }, width: 100, height: 60, data: { provider: 'gcp' } },
    { id: 'n2', type: 'resource', position: { x: 0, y: 0 }, width: 100, height: 60, data: { provider: 'gcp' } },
    { id: 'n3', type: 'resource', position: { x: 0, y: 0 }, width: 100, height: 60, data: { provider: 'aws' } },
  ],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

interface CaptureArgs {
  isOpen?: boolean;
  activeCard?: Card | null;
  deploy?: Partial<DeployState>;
  fetchRequirements?: () => Promise<void>;
  store: TestStore;
}

interface Captured {
  result: UseDeployEffectsReturn;
}

function captureHook(args: CaptureArgs): Captured {
  const baseDeploy: DeployState = args.store.getState().deploy;
  const deploy = { ...baseDeploy, ...args.deploy };
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const result = useDeployEffects({
      isOpen: args.isOpen ?? true,
      activeCard: args.activeCard ?? null,
      deploy,
      fetchRequirements: args.fetchRequirements ?? (async () => undefined),
    });
    captured.current = { result };
    // Reference the ref so React preserves identity through render.
    useRef(result.logEndRef);
    return null;
  };
  renderToString(
    <Provider store={args.store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

beforeEach(() => {
  mocks.effects.length = 0;
  mocks.syncUseEffect.current = true;
  mockDeployApi.getResources.mockReset();
  mockDeployApi.getDeployments.mockReset();
  mockProviderApi.isConnected.mockReset();
  mockProviderApi.getProjects.mockReset();
  mockOnDeployEvent.mockReset();
  // Default: getDeployments returns empty array so the hydrate effect's
  // history-fetch path doesn't pollute dispatchSpy on tests that focus on
  // other effects. Override per-test where the hydrate path matters.
  mockDeployApi.getDeployments.mockResolvedValue([]);
});

// ─── Effect-locator helpers ─────────────────────────────────────────────────
// The four effects register in this order:
//   [0] auto-scroll        — deps: [logs.length]              (length 1)
//   [1] provider auto-detect — deps: [isOpen, cardId, gcpProject, region, dispatch] (length 5)
//   [2] requirement listener — deps: [isOpen, cardId]         (length 2)
//   [3] history hydrate     — deps: [cardId, dispatch]        (length 2)
// We also confirm by content (effect 2 is the only length-2 with `isOpen`-shape
// boolean as first dep; effect 3 starts with cardId/string).

const effectByOrder = (i: number): CapturedEffect => {
  if (!mocks.effects[i]) throw new Error(`effect index ${i} not registered`);
  return mocks.effects[i];
};

// ────────────────────────────────────────────────────────────────────────────
// Effect 1 — auto-scroll logs
// ────────────────────────────────────────────────────────────────────────────

describe('effect 1: auto-scroll logs', () => {
  it('registers an effect with deps = [logs.length] (length 1)', () => {
    const store = makeStore();
    captureHook({ activeCard: ACTIVE_CARD, store });
    const e = effectByOrder(0);
    expect(e.deps).toHaveLength(1);
    // The dep is a number (the logs array length).
    expect(typeof e.deps?.[0]).toBe('number');
  });

  it('calls scrollIntoView({ behavior: "smooth" }) when logEndRef.current is set', () => {
    const store = makeStore();
    const { result } = captureHook({ activeCard: ACTIVE_CARD, store });
    // Manually populate the ref with a stand-in node and re-fire the effect.
    const scrollIntoView = vi.fn();
    (result.logEndRef as unknown as { current: { scrollIntoView: typeof scrollIntoView } }).current = {
      scrollIntoView,
    };
    effectByOrder(0).cb();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('does not crash when logEndRef.current is null (the ?. chain)', () => {
    const store = makeStore();
    captureHook({ activeCard: ACTIVE_CARD, store });
    // The first sync render already invoked the cb with current=null —
    // if it crashed, the renderToString call would have thrown.
    // Re-fire to reconfirm.
    expect(() => effectByOrder(0).cb()).not.toThrow();
  });

  it('is unconditional — registered even when isOpen is false', () => {
    const store = makeStore();
    captureHook({ isOpen: false, activeCard: ACTIVE_CARD, store });
    // RISK #6: the auto-scroll effect must register regardless of panel state.
    expect(mocks.effects[0]).toBeDefined();
    expect(mocks.effects[0].deps).toHaveLength(1);
  });

  it('is unconditional — registered even when activeCard is null', () => {
    const store = makeStore();
    captureHook({ activeCard: null, store });
    expect(mocks.effects[0]).toBeDefined();
    expect(mocks.effects[0].deps).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 2 — provider auto-detect + getResources + auto-fill gcpProject
// ────────────────────────────────────────────────────────────────────────────

describe('effect 2: provider auto-detect + getResources + auto-fill gcpProject', () => {
  it('registers with deps [isOpen, cardId, gcpProject, region, dispatch] (length 5)', () => {
    const store = makeStore();
    captureHook({ activeCard: ACTIVE_CARD, store });
    const e = effectByOrder(1);
    expect(e.deps).toHaveLength(5);
  });

  it('returns early when !isOpen (no dispatches)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ isOpen: false, activeCard: ACTIVE_CARD, store });
    // Effect 2 must short-circuit before dispatching setProvider.
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setProvider');
    expect(mockDeployApi.getResources).not.toHaveBeenCalled();
  });

  it('returns early when !activeCard (no dispatches)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: null, store });
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('deploy/setProvider');
    expect(mockDeployApi.getResources).not.toHaveBeenCalled();
  });

  it('dispatches setProvider with the dominant provider detected from canvas nodes', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // ACTIVE_CARD has 2 gcp + 1 aws — gcp is dominant.
    captureHook({ activeCard: ACTIVE_CARD, store });
    const setProviderCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/setProvider',
    );
    expect(setProviderCall).toBeDefined();
    const action = setProviderCall![0] as unknown as { payload: string };
    expect(action.payload).toBe('gcp');
  });

  it('dispatches setRegion when current region is not in detected provider region list', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // The default deploy.region is "us-central1" which IS in the gcp list,
    // so override with something that isn't.
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { region: 'mars-1' },
      store,
    });
    const setRegionCall = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setRegion');
    expect(setRegionCall).toBeDefined();
    const action = setRegionCall![0] as unknown as { payload: string };
    // First gcp region is us-central1.
    expect(action.payload).toBe('us-central1');
  });

  it('does NOT dispatch setRegion when current region is already valid for the provider', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { region: 'europe-west1' }, // valid for gcp
      store,
    });
    const setRegionCall = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setRegion');
    expect(setRegionCall).toBeUndefined();
  });

  it('does NOT dispatch setRegion when detected provider has no region list (PROVIDER_REGIONS miss)', () => {
    const store = makeStore();
    // Build a card with all "kubernetes" nodes — kubernetes has no entry in
    // PROVIDER_REGIONS so the `regions` check is falsy.
    const card: Card = {
      ...ACTIVE_CARD,
      nodes: [
        { id: 'n1', type: 'resource', position: { x: 0, y: 0 }, width: 1, height: 1, data: { provider: 'kubernetes' } },
      ],
    };
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: card, store });
    const setRegionCall = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setRegion');
    expect(setRegionCall).toBeUndefined();
  });

  it('async path: getResources success → dispatches setDeployedResources', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({
      success: true,
      resources: [{ id: 'r1', type: 't', name: 'a' }],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockDeployApi.getResources).toHaveBeenCalledWith('card-1');
    const setDR = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setDeployedResources');
    expect(setDR).toBeDefined();
    const action = setDR![0] as unknown as { payload: unknown[] };
    expect(action.payload).toEqual([{ id: 'r1', type: 't', name: 'a' }]);
  });

  it('async path: getResources success: false → does NOT dispatch setDeployedResources', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: false });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const setDR = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setDeployedResources');
    expect(setDR).toBeUndefined();
  });

  it('async path: getResources success but resources missing → skips setDeployedResources', async () => {
    const store = makeStore();
    // success:true but no resources field — the `if (res.success && res.resources)`
    // gate prevents the dispatch.
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const setDR = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setDeployedResources');
    expect(setDR).toBeUndefined();
  });

  it('async path: getResources throw is silently caught (no crash, no dispatch)', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockRejectedValueOnce(new Error('refresh-failed'));
    // Auto-fill path also runs — wire it to NOT crash so the test isolates getResources.
    mockProviderApi.isConnected.mockResolvedValueOnce(false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const setDR = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setDeployedResources');
    expect(setDR).toBeUndefined();
  });

  it('auto-fill gcpProject: !gcpProject + isConnected + getProjects.length>0 → dispatches setGcpProject', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockResolvedValueOnce(true);
    mockProviderApi.getProjects.mockResolvedValueOnce([{ id: 'proj-A' }, { id: 'proj-B' }]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: '' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockProviderApi.isConnected).toHaveBeenCalledWith('gcp');
    expect(mockProviderApi.getProjects).toHaveBeenCalledWith('gcp');
    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeDefined();
    const action = setGcp![0] as unknown as { payload: string };
    expect(action.payload).toBe('proj-A');
  });

  it('auto-fill gcpProject: skipped when gcpProject already set', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: 'preexisting-project' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockProviderApi.isConnected).not.toHaveBeenCalled();
    expect(mockProviderApi.getProjects).not.toHaveBeenCalled();
  });

  it('auto-fill gcpProject: skipped when isConnected returns false', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockResolvedValueOnce(false);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: '' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockProviderApi.getProjects).not.toHaveBeenCalled();
    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeUndefined();
  });

  it('auto-fill gcpProject: skipped when getProjects returns empty array', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockResolvedValueOnce(true);
    mockProviderApi.getProjects.mockResolvedValueOnce([]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: '' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeUndefined();
  });

  it('auto-fill gcpProject: skipped when getProjects returns null', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockResolvedValueOnce(true);
    // getProjects returns null — the `projects?.length > 0` guard fails.
    mockProviderApi.getProjects.mockResolvedValueOnce(null);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: '' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeUndefined();
  });

  it('auto-fill gcpProject: silent catch when isConnected throws', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockRejectedValueOnce(new Error('auth-broken'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    // Should NOT throw despite the rejected isConnected promise.
    expect(() =>
      captureHook({
        activeCard: ACTIVE_CARD,
        deploy: { gcpProject: '' },
        store,
      }),
    ).not.toThrow();
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeUndefined();
  });

  it('auto-fill gcpProject: silent catch when getProjects throws', async () => {
    const store = makeStore();
    mockDeployApi.getResources.mockResolvedValueOnce({ success: true, resources: [] });
    mockProviderApi.isConnected.mockResolvedValueOnce(true);
    mockProviderApi.getProjects.mockRejectedValueOnce(new Error('projects-listed-failed'));
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({
      activeCard: ACTIVE_CARD,
      deploy: { gcpProject: '' },
      store,
    });
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    const setGcp = dispatchSpy.mock.calls.find((c) => (c[0] as { type: string }).type === 'deploy/setGcpProject');
    expect(setGcp).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 3 — onDeployEvent listener (requirement_verified)
// ────────────────────────────────────────────────────────────────────────────

describe('effect 3: onDeployEvent listener', () => {
  it('registers with deps [isOpen, cardId] (length 2)', () => {
    const store = makeStore();
    mockOnDeployEvent.mockReturnValue(() => undefined);
    captureHook({ activeCard: ACTIVE_CARD, store });
    const e = effectByOrder(2);
    expect(e.deps).toHaveLength(2);
    expect(typeof e.deps?.[0]).toBe('boolean');
    expect(typeof e.deps?.[1]).toBe('string');
  });

  it('returns early when !isOpen — does not subscribe', () => {
    const store = makeStore();
    captureHook({ isOpen: false, activeCard: ACTIVE_CARD, store });
    expect(mockOnDeployEvent).not.toHaveBeenCalled();
  });

  it('returns early when !activeCard — does not subscribe', () => {
    const store = makeStore();
    captureHook({ activeCard: null, store });
    expect(mockOnDeployEvent).not.toHaveBeenCalled();
  });

  it('subscribes via getApi().onDeployEvent and returns the unsubscribe as cleanup', () => {
    const store = makeStore();
    const unsubscribe = vi.fn();
    mockOnDeployEvent.mockReturnValue(unsubscribe);
    captureHook({ activeCard: ACTIVE_CARD, store });

    expect(mockOnDeployEvent).toHaveBeenCalledTimes(1);
    const e = effectByOrder(2);
    expect(typeof e.cleanup).toBe('function');
    // Invoking the captured cleanup should call our unsubscribe spy.
    (e.cleanup as () => void)();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('handler invokes fetchRequirements on event.type === "requirement_verified"', () => {
    const store = makeStore();
    let handler: ((event: { type: string }) => void) | undefined;
    mockOnDeployEvent.mockImplementation((cb: (event: { type: string }) => void) => {
      handler = cb;
      return () => undefined;
    });
    const fetchRequirements = vi.fn().mockResolvedValue(undefined);
    captureHook({ activeCard: ACTIVE_CARD, fetchRequirements, store });

    handler!({ type: 'requirement_verified' });
    expect(fetchRequirements).toHaveBeenCalledTimes(1);
  });

  it('handler ignores other event types (no fetchRequirements call)', () => {
    const store = makeStore();
    let handler: ((event: { type: string }) => void) | undefined;
    mockOnDeployEvent.mockImplementation((cb: (event: { type: string }) => void) => {
      handler = cb;
      return () => undefined;
    });
    const fetchRequirements = vi.fn().mockResolvedValue(undefined);
    captureHook({ activeCard: ACTIVE_CARD, fetchRequirements, store });

    handler!({ type: 'log' });
    handler!({ type: 'node_status' });
    handler!({ type: 'complete' });
    expect(fetchRequirements).not.toHaveBeenCalled();
  });

  it('handler swallows fetchRequirements rejections (no unhandled error)', async () => {
    const store = makeStore();
    let handler: ((event: { type: string }) => void) | undefined;
    mockOnDeployEvent.mockImplementation((cb: (event: { type: string }) => void) => {
      handler = cb;
      return () => undefined;
    });
    const fetchRequirements = vi.fn().mockRejectedValue(new Error('req-failed'));
    captureHook({ activeCard: ACTIVE_CARD, fetchRequirements, store });

    // Should not throw despite the rejected promise.
    expect(() => handler!({ type: 'requirement_verified' })).not.toThrow();
    await flushMicrotasks();
    expect(fetchRequirements).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Effect 4 — hydrate deploy results from history
// ────────────────────────────────────────────────────────────────────────────

describe('effect 4: hydrate from history', () => {
  it('registers with deps [cardId, dispatch] (length 2)', () => {
    const store = makeStore();
    captureHook({ activeCard: ACTIVE_CARD, store });
    const e = effectByOrder(3);
    expect(e.deps).toHaveLength(2);
    // First dep is the card id (string).
    expect(typeof e.deps?.[0]).toBe('string');
  });

  it('returns early when !activeCard — no fetch, no dispatch', async () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: null, store });
    await flushMicrotasks();

    expect(mockDeployApi.getDeployments).not.toHaveBeenCalled();
    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('fetches getDeployments(activeCard.id) and finds the most-recent terminal apply', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      // The hook does Array.find — first match wins, i.e. position-ordered.
      {
        id: 'd-1',
        action_type: 'apply',
        status: 'success',
        environment: 'production',
        duration_ms: 5000,
        error: null,
        results: { resources: [{ id: 'r1', type: 't', name: 'a' }] },
      },
      // Earlier history that would also match — should not be picked because
      // .find() returns the first match.
      { id: 'd-0', action_type: 'apply', status: 'failed', error: 'whatever' },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockDeployApi.getDeployments).toHaveBeenCalledWith('card-1');
    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeDefined();
    const action = hydrateCall![0] as unknown as {
      payload: {
        cardId: string;
        status: string;
        results: unknown[];
        error: string | null;
        duration_ms?: number;
        environment?: string;
      };
    };
    expect(action.payload).toEqual({
      cardId: 'card-1',
      status: 'success',
      results: [{ id: 'r1', type: 't', name: 'a' }],
      error: null,
      duration_ms: 5000,
      environment: 'production',
    });
  });

  it('accepts action_type "rollback" as a terminal apply equivalent', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      {
        id: 'd-rb',
        action_type: 'rollback',
        status: 'partial',
        results: { resources: [{ id: 'r1' }] },
      },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeDefined();
    const action = hydrateCall![0] as unknown as { payload: { status: string } };
    expect(action.payload.status).toBe('partial');
  });

  it('skips plan-only entries — finds nothing to hydrate when only "plan" rows exist', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      { id: 'd-1', action_type: 'plan', status: 'success' },
      { id: 'd-2', action_type: 'plan', status: 'success' },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('skips non-terminal apply rows (e.g. "running" status)', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([{ id: 'd-1', action_type: 'apply', status: 'running' }]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('returns early on empty history (no dispatch)', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('returns early on non-array history (defensive Array.isArray gate)', async () => {
    const store = makeStore();
    // Server returns null/object — the Array.isArray gate must fail safe.
    mockDeployApi.getDeployments.mockResolvedValueOnce(null as unknown as []);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('coerces missing latest.results.resources to [] before dispatching', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      // No `results` key at all — the fallback should produce empty array.
      { id: 'd-1', action_type: 'apply', status: 'success' },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeDefined();
    const action = hydrateCall![0] as unknown as { payload: { results: unknown[] } };
    expect(action.payload.results).toEqual([]);
  });

  it('coerces results.resources non-array to [] (defensive cast)', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      // `results.resources` is not an array — defensive `Array.isArray` gate
      // must coerce to [] even though the backend never returns this shape.
      { id: 'd-1', action_type: 'apply', status: 'success', results: { resources: 'not-an-array' } },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeDefined();
    const action = hydrateCall![0] as unknown as { payload: { results: unknown[] } };
    expect(action.payload.results).toEqual([]);
  });

  it('coerces nullish duration_ms / environment to undefined', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      // duration_ms is null and environment is missing — both should fall
      // through the `?? undefined` to undefined.
      { id: 'd-1', action_type: 'apply', status: 'success', duration_ms: null, results: { resources: [] } },
    ]);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    const action = hydrateCall![0] as unknown as {
      payload: { duration_ms: number | undefined; environment: string | undefined };
    };
    expect(action.payload.duration_ms).toBeUndefined();
    expect(action.payload.environment).toBeUndefined();
  });

  it('cancellation: invoking cleanup before promise resolves prevents the dispatch', async () => {
    const store = makeStore();
    // Hold the resolution open so we can invoke cleanup BEFORE the promise resolves.
    let resolve: ((value: unknown) => void) | undefined;
    mockDeployApi.getDeployments.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    // Invoke effect 4's cleanup → flips `cancelled = true` inside the closure.
    const cleanup = effectByOrder(3).cleanup as () => void;
    expect(typeof cleanup).toBe('function');
    cleanup();
    // Now resolve the deferred fetch with a hydrate-worthy payload.
    resolve!([{ id: 'd-1', action_type: 'apply', status: 'success', results: { resources: [] } }]);
    await flushMicrotasks();
    await flushMicrotasks();

    // The `if (cancelled) return;` guard at the top of the IIFE prevents the
    // dispatch even though the response shape is otherwise valid.
    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
  });

  it('throws are caught and warned — no dispatch, no rethrow', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockRejectedValueOnce(new Error('db-down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    // The `[deploy-panel] hydrate failed` prefix is searchable in production
    // logs — assert it landed.
    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls;
    const hydrateWarn = calls.find((c) => typeof c[0] === 'string' && c[0].includes('[deploy-panel] hydrate failed'));
    expect(hydrateWarn).toBeDefined();

    const hydrateCall = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'deploy/hydrateDeployFromHistory',
    );
    expect(hydrateCall).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('emits the searchable [deploy-panel] hydrate fetch console.log on every fetch', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const fetchLog = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('[deploy-panel] hydrate fetch'),
    );
    expect(fetchLog).toBeDefined();
    logSpy.mockRestore();
  });

  it('emits the [deploy-panel] hydrate: no terminal apply diagnostic when the find returns undefined', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([{ id: 'd-1', action_type: 'plan', status: 'success' }]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const noTerminalLog = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('[deploy-panel] hydrate: no terminal apply in history'),
    );
    expect(noTerminalLog).toBeDefined();
    logSpy.mockRestore();
  });

  it('emits the [deploy-panel] hydrate dispatch diagnostic on the success path', async () => {
    const store = makeStore();
    mockDeployApi.getDeployments.mockResolvedValueOnce([
      { id: 'd-1', action_type: 'apply', status: 'success', results: { resources: [] } },
    ]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    captureHook({ activeCard: ACTIVE_CARD, store });
    await flushMicrotasks();
    await flushMicrotasks();

    const dispatchLog = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('[deploy-panel] hydrate dispatch'),
    );
    expect(dispatchLog).toBeDefined();
    logSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Return shape
// ────────────────────────────────────────────────────────────────────────────

describe('useDeployEffects — return shape', () => {
  it('returns an object containing logEndRef (a React ref object)', () => {
    const store = makeStore();
    const { result } = captureHook({ activeCard: ACTIVE_CARD, store });
    expect(result.logEndRef).toBeDefined();
    // React ref objects are { current: ... }; on first render `current` is null.
    expect((result.logEndRef as { current: unknown }).current).toBeNull();
  });

  it('registers exactly four effects per render', () => {
    const store = makeStore();
    captureHook({ activeCard: ACTIVE_CARD, store });
    expect(mocks.effects).toHaveLength(4);
  });
});
