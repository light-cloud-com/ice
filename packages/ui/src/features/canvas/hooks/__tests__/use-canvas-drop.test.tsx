/**
 * rf-canv-24 — useCanvasDrop hook tests.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The hook is exercised via the Provider +
 * capture-ref harness from rf-canv-20/21/22/23 — render
 * `<Provider><Probe /></Provider>` with `renderToString`, capture the
 * hook's return value into a ref, then invoke the callbacks with a
 * synthetic `React.DragEvent` fixture and assert against
 * `vi.spyOn(store, 'dispatch')`.
 *
 * No `useEffect` or timer machinery is required — `useCanvasDrop`
 * exposes only `useCallback`s. The four heavy dependencies
 * (`getBlueprint`, `expandBlueprint`, `generateGhostSuggestions`,
 * `logDrop` / `logBlueprint`) are mocked at module scope so the
 * dispatch-spy assertions are deterministic.
 *
 * `Date.now()` is stubbed via `vi.setSystemTime` so the
 * `group-${Date.now()}` / `node-${Date.now()}` id formats are
 * verifiable.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────
// Use vi.hoisted so the spy identities are stable across the vi.mock
// factories below (rf-canv-12 learning).
const mocks = vi.hoisted(() => ({
  logDropSpy: vi.fn(),
  logBlueprintSpy: vi.fn(),
  getBlueprintSpy: vi.fn(),
  expandBlueprintSpy: vi.fn(),
  generateGhostSuggestionsSpy: vi.fn(),
}));

// Mock the blueprint helpers so block-drop dispatches are deterministic.
vi.mock('../../../../config/blocks', () => ({
  getBlueprint: mocks.getBlueprintSpy,
  expandBlueprint: mocks.expandBlueprintSpy,
}));

// Mock the debug-logger so logDrop / logBlueprint observation is direct.
vi.mock('../../../../shared/utils/debug-logger', () => ({
  logDrop: mocks.logDropSpy,
  logBlueprint: mocks.logBlueprintSpy,
}));

// Mock the ghost-suggestions builder so we can assert on its inputs/outputs
// without threading the full ghost-graph topology in tests.
vi.mock('../../utils/ghost-suggestions', () => ({
  generateGhostSuggestions: mocks.generateGhostSuggestionsSpy,
}));

// Mock canContain so each test can flip the parent-id gate independently
// of real containment-rules data. Default-allow; specific tests deny.
vi.mock('../../../../config/containment-rules', () => ({
  canContain: vi.fn(() => true),
}));

// Import AFTER the mocks are registered so the hook closes over them.
import { useCanvasDrop, type UseCanvasDropResult } from '../use-canvas-drop';
import { canContain } from '../../../../config/containment-rules';
import type { CardNode, CardEdge } from '../../../../store/slices/cards-slice';
import type { CanvasNode } from '../../components/types';

// ─── Store builder ──────────────────────────────────────────────────────────
// The hook DISPATCHES into `cards-slice` (`addNodeToCard`,
// `expandBlueprintToCard`) and `ghost-slice` (`setGhosts`). It never
// reads from Redux state itself — `nodes` and `edges` are passed via the
// args object — so we can mount minimal stub reducers and assert on the
// dispatched action shape via `vi.spyOn(store, 'dispatch')`.

const cardsStubSlice = createSlice({
  name: 'cards',
  initialState: { activeCardId: null, cards: [] },
  reducers: {},
});
const ghostsStubSlice = createSlice({
  name: 'ghosts',
  initialState: { ghosts: [] },
  reducers: {},
});
const deployStubSlice = createSlice({
  name: 'deploy',
  initialState: { provider: 'gcp' as string },
  reducers: {},
});

const makeStore = (deployProvider = 'gcp') =>
  configureStore({
    reducer: {
      cards: cardsStubSlice.reducer,
      ghosts: ghostsStubSlice.reducer,
      deploy: deployStubSlice.reducer,
    },
    preloadedState: {
      cards: { activeCardId: null, cards: [] } as any,
      ghosts: { ghosts: [] } as any,
      deploy: { provider: deployProvider } as any,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

type TestStore = ReturnType<typeof makeStore>;

// ─── Probe ──────────────────────────────────────────────────────────────────

interface CaptureArgs {
  screenToCanvas?: (clientX: number, clientY: number) => { x: number; y: number };
  findContainerAtPosition?: (x: number, y: number) => CanvasNode | null;
  nodes?: CardNode[];
  edges?: CardEdge[];
}

const captureHook = (store: TestStore, overrides: CaptureArgs = {}): UseCanvasDropResult => {
  const args = {
    screenToCanvas:
      overrides.screenToCanvas ?? ((cx: number, cy: number) => ({ x: cx, y: cy })),
    findContainerAtPosition: overrides.findContainerAtPosition ?? (() => null),
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
  };
  const captured: { current?: UseCanvasDropResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasDrop(args);
    return <div>probe</div>;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

/**
 * Build a synthetic `React.DragEvent` whose `dataTransfer.getData(key)`
 * returns the string at `entries[key]` and `'' ` (the browser's default)
 * for missing keys. `dropEffect` is a writable string slot — that's all
 * `handleDragOver` touches.
 */
function mockDataTransferEvent(entries: Record<string, string>, clientX = 0, clientY = 0) {
  const dropEffect = { value: 'none' as 'none' | 'copy' | 'link' | 'move' };
  const dataTransfer = {
    getData: (key: string) => (key in entries ? entries[key] : ''),
    get dropEffect() {
      return dropEffect.value;
    },
    set dropEffect(v: 'none' | 'copy' | 'link' | 'move') {
      dropEffect.value = v;
    },
  };
  const preventDefault = vi.fn();
  return {
    event: {
      dataTransfer,
      clientX,
      clientY,
      preventDefault,
    } as unknown as React.DragEvent,
    preventDefault,
    dropEffectRef: dropEffect,
  };
}

const fakeContainer = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: overrides.id ?? 'container-1',
    type: overrides.type ?? 'container',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    data: {
      label: 'Container',
      iceType: 'Group.Generic',
      ...(overrides.data ?? {}),
    },
    parentId: overrides.parentId ?? null,
    ...overrides,
  } as unknown as CanvasNode);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  // Default: mocks return successful values.
  vi.mocked(canContain).mockReturnValue(true);
  mocks.generateGhostSuggestionsSpy.mockReturnValue([]);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasDrop — return shape', () => {
  it('exposes handleDrop and handleDragOver as functions', () => {
    const store = makeStore();
    const result = captureHook(store);
    expect(typeof result.handleDrop).toBe('function');
    expect(typeof result.handleDragOver).toBe('function');
  });
});

describe('useCanvasDrop — empty payload short-circuit', () => {
  it('does not dispatch when no group/block/resource keys are set', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event, preventDefault } = mockDataTransferEvent({});
    result.handleDrop(event);

    // preventDefault always fires — the short-circuit is checked AFTER.
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(mocks.logDropSpy).not.toHaveBeenCalled();
  });
});

describe('useCanvasDrop — group drop branch', () => {
  it('dispatches addNodeToCard with Group.${type} iceType + defaults', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent(
      { 'application/ice-group': 'AppGroup' },
      120,
      240,
    );
    result.handleDrop(event);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as {
      type: string;
      payload: CardNode;
    };
    expect(action.type).toBe('cards/addNodeToCard');
    expect(action.payload).toMatchObject({
      type: 'container',
      position: { x: 120, y: 240 },
      width: 400,
      height: 300,
      data: {
        label: 'New Group',
        iceType: 'Group.AppGroup',
        groupColor: '#3b82f6',
        behavior: 'container',
        folded: false,
      },
    });
    expect(action.payload.id).toMatch(/^group-/);
  });

  it("honors application/ice-group-name and -color overrides", () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({
      'application/ice-group': 'Service',
      'application/ice-group-name': 'My Custom Group',
      'application/ice-group-color': '#ff00ff',
    });
    result.handleDrop(event);

    const action = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: CardNode };
    expect(action.payload.data.label).toBe('My Custom Group');
    expect(action.payload.data.groupColor).toBe('#ff00ff');
    expect(action.payload.data.iceType).toBe('Group.Service');
  });

  it('does NOT publish ghost suggestions on group drop', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({ 'application/ice-group': 'X' });
    result.handleDrop(event);

    // Only one dispatch — addNodeToCard, no setGhosts.
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const action = dispatchSpy.mock.calls[0][0] as { type: string };
    expect(action.type).toBe('cards/addNodeToCard');
    expect(mocks.generateGhostSuggestionsSpy).not.toHaveBeenCalled();
  });
});

describe('useCanvasDrop — block drop with blueprint', () => {
  const fakeBlueprint = {
    iceType: 'Compute.Service',
    nodeData: { iceType: 'Compute.Service', label: 'Service' },
  };
  const fakeExpanded = {
    node: {
      id: 'expanded-svc',
      type: 'block' as const,
      data: { iceType: 'Compute.Service', label: 'Service' },
      width: 200,
      height: 100,
    },
    children: [],
    edges: [],
  };

  beforeEach(() => {
    mocks.getBlueprintSpy.mockReturnValue(fakeBlueprint);
    mocks.expandBlueprintSpy.mockReturnValue(fakeExpanded);
    mocks.generateGhostSuggestionsSpy.mockReturnValue([{ id: 'g1' }]);
  });

  it('dispatches expandBlueprintToCard + setGhosts when blueprint resolves', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({ 'application/ice-block': 'service' }, 50, 60);
    result.handleDrop(event);

    // pdl-11: palette didn't pin a provider, so the active deploy provider
    // (default 'gcp') is threaded into both getBlueprint and expandBlueprint.
    expect(mocks.getBlueprintSpy).toHaveBeenCalledWith('service', 'gcp');
    expect(mocks.expandBlueprintSpy).toHaveBeenCalledWith(fakeBlueprint, {
      position: { x: 50, y: 60 },
      provider: 'gcp',
      parentContainerId: undefined,
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string; payload: unknown };
    const a2 = dispatchSpy.mock.calls[1][0] as { type: string; payload: unknown };
    expect(a1.type).toBe('cards/expandBlueprintToCard');
    expect(a1.payload).toBe(fakeExpanded);
    expect(a2.type).toBe('ghosts/setGhosts');
  });

  it('passes provider override through to getBlueprint when not "all"', () => {
    const store = makeStore();
    const result = captureHook(store);
    const { event } = mockDataTransferEvent({
      'application/ice-block': 'service',
      'application/ice-block-provider': 'aws',
    });
    result.handleDrop(event);

    expect(mocks.getBlueprintSpy).toHaveBeenCalledWith('service', 'aws');
    expect(mocks.expandBlueprintSpy).toHaveBeenCalledWith(
      fakeBlueprint,
      expect.objectContaining({ provider: 'aws' }),
    );
  });

  it('merges application/ice-block-data JSON via Object.assign', () => {
    const store = makeStore();
    const result = captureHook(store);
    // Mutate the fake blueprint's expanded.node.data so we can observe the merge.
    const mutableExpanded = {
      ...fakeExpanded,
      node: {
        ...fakeExpanded.node,
        data: { iceType: 'Compute.Service', label: 'Service' },
      },
    };
    mocks.expandBlueprintSpy.mockReturnValue(mutableExpanded);

    const { event } = mockDataTransferEvent({
      'application/ice-block': 'service',
      'application/ice-block-data': JSON.stringify({ runtime: 'node20', count: 2 }),
    });
    result.handleDrop(event);

    expect(mutableExpanded.node.data).toMatchObject({
      iceType: 'Compute.Service',
      label: 'Service',
      runtime: 'node20',
      count: 2,
    });
  });

  it('silently ignores malformed application/ice-block-data JSON', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    // The fake expanded.node.data shouldn't be mutated, no throw.
    const { event } = mockDataTransferEvent({
      'application/ice-block': 'service',
      'application/ice-block-data': '{not valid json',
    });
    expect(() => result.handleDrop(event)).not.toThrow();

    // Both block dispatches still fire (no early-return, no console error).
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string };
    expect(a1.type).toBe('cards/expandBlueprintToCard');
  });

  it('logBlueprint fires only on the block-with-blueprint path', () => {
    const store = makeStore();
    const result = captureHook(store);

    const { event } = mockDataTransferEvent({ 'application/ice-block': 'service' });
    result.handleDrop(event);

    expect(mocks.logBlueprintSpy).toHaveBeenCalledTimes(1);
    // logBlueprint logs the *palette* provider (undefined here), not the
    // deploy-provider fallback — analytics tracks user intent, not the
    // post-fallback effective value.
    expect(mocks.logBlueprintSpy).toHaveBeenCalledWith({
      type: 'Compute.Service',
      provider: undefined,
      childCount: 0,
      containerWidth: 200,
      containerHeight: 100,
    });
  });

  // ─── pdl-11: deploy-provider fallback ───────────────────────────────────
  it('falls back to the active deploy provider when palette omits one', () => {
    const store = makeStore('aws');
    const result = captureHook(store);
    const { event } = mockDataTransferEvent({ 'application/ice-block': 'service' });
    result.handleDrop(event);

    expect(mocks.getBlueprintSpy).toHaveBeenCalledWith('service', 'aws');
    expect(mocks.expandBlueprintSpy).toHaveBeenCalledWith(
      fakeBlueprint,
      expect.objectContaining({ provider: 'aws' }),
    );
  });

  it('palette provider wins over the active deploy provider', () => {
    const store = makeStore('gcp');
    const result = captureHook(store);
    const { event } = mockDataTransferEvent({
      'application/ice-block': 'service',
      'application/ice-block-provider': 'azure',
    });
    result.handleDrop(event);

    expect(mocks.getBlueprintSpy).toHaveBeenCalledWith('service', 'azure');
    expect(mocks.expandBlueprintSpy).toHaveBeenCalledWith(
      fakeBlueprint,
      expect.objectContaining({ provider: 'azure' }),
    );
  });
});

describe('useCanvasDrop — block drop without blueprint (fallthrough)', () => {
  it('falls through to resource branch when getBlueprint returns falsy', () => {
    mocks.getBlueprintSpy.mockReturnValue(undefined);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({
      'application/ice-block': 'unknown-block',
      'application/ice-block-name': 'Fallback Label',
    });
    result.handleDrop(event);

    // Resource branch fires: addNodeToCard + setGhosts.
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardNode };
    expect(a1.type).toBe('cards/addNodeToCard');
    expect(a1.payload.type).toBe('resource');
    // iceType falls back to 'Resource.Unknown' since no resourceType.
    expect(a1.payload.data.iceType).toBe('Resource.Unknown');
    // Label sourced from application/ice-block-name fallback chain.
    expect(a1.payload.data.label).toBe('Fallback Label');
    // logBlueprint did NOT fire (no blueprint).
    expect(mocks.logBlueprintSpy).not.toHaveBeenCalled();
  });
});

describe('useCanvasDrop — resource drop branch', () => {
  it('dispatches addNodeToCard with Resource.${type} iceType + setGhosts', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent(
      { 'application/ice-resource': 'Compute.Vm' },
      300,
      450,
    );
    result.handleDrop(event);

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const a1 = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardNode };
    expect(a1.type).toBe('cards/addNodeToCard');
    expect(a1.payload).toMatchObject({
      type: 'resource',
      position: { x: 300, y: 450 },
      data: {
        iceType: 'Compute.Vm',
        behavior: 'singleton',
        folded: false,
        // pdl-11: resource drops default provider to the active deploy
        // provider (default 'gcp') so the deploy panel doesn't filter the
        // node out as "skipped — non-<provider>".
        provider: 'gcp',
      },
    });
    expect(a1.payload.id).toMatch(/^node-/);

    const a2 = dispatchSpy.mock.calls[1][0] as { type: string };
    expect(a2.type).toBe('ghosts/setGhosts');
    expect(mocks.generateGhostSuggestionsSpy).toHaveBeenCalledTimes(1);
  });

  it('uses active deploy provider for resource drops (pdl-11)', () => {
    const store = makeStore('azure');
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({ 'application/ice-resource': 'Storage.Bucket' });
    result.handleDrop(event);

    const a1 = dispatchSpy.mock.calls[0][0] as { type: string; payload: CardNode };
    expect(a1.payload.data.provider).toBe('azure');
  });

  it('uses application/ice-resource-name for label, then iceType as final fallback', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store);
    dispatchSpy.mockClear();

    const { event: e1 } = mockDataTransferEvent({
      'application/ice-resource': 'Storage.Bucket',
      'application/ice-resource-name': 'My Bucket',
    });
    result.handleDrop(e1);
    const a1 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: CardNode };
    expect(a1.payload.data.label).toBe('My Bucket');

    dispatchSpy.mockClear();
    const { event: e2 } = mockDataTransferEvent({
      'application/ice-resource': 'Storage.Bucket',
    });
    result.handleDrop(e2);
    const a2 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: CardNode };
    expect(a2.payload.data.label).toBe('Storage.Bucket');
  });
});

describe('useCanvasDrop — canContain gates parentId only', () => {
  it('drop onto allowed container sets parentId on the new node', () => {
    const container = fakeContainer({ id: 'parent-1' });
    vi.mocked(canContain).mockReturnValue(true);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, {
      findContainerAtPosition: () => container,
    });
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({ 'application/ice-resource': 'Compute.Vm' });
    result.handleDrop(event);

    const a1 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: CardNode };
    expect(a1.payload.parentId).toBe('parent-1');
  });

  it('drop onto a container that does NOT canContain creates the node WITHOUT parentId', () => {
    const container = fakeContainer({ id: 'parent-2' });
    vi.mocked(canContain).mockReturnValue(false);
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const result = captureHook(store, {
      findContainerAtPosition: () => container,
    });
    dispatchSpy.mockClear();

    const { event } = mockDataTransferEvent({ 'application/ice-resource': 'Compute.Vm' });
    result.handleDrop(event);

    // Drop still happens — only the parentId gate is closed.
    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    const a1 = dispatchSpy.mock.calls[0][0] as unknown as { type: string; payload: CardNode };
    expect(a1.payload.parentId).toBeUndefined();
    expect(a1.type).toBe('cards/addNodeToCard');
  });

  it('block-drop respects canContain when wiring parentContainerId', () => {
    mocks.getBlueprintSpy.mockReturnValue({
      iceType: 'Compute.Service',
      nodeData: { iceType: 'Compute.Service' },
    });
    mocks.expandBlueprintSpy.mockImplementation((_bp, opts) => ({
      node: {
        id: 'expanded',
        type: 'block',
        data: { iceType: 'Compute.Service' },
        width: 200,
        height: 100,
      },
      children: [],
      edges: [],
      // expose the opts so the test can assert what got passed in
      _opts: opts,
    }));

    const container = fakeContainer({ id: 'allowed-parent' });

    // Allowed → parentContainerId set.
    vi.mocked(canContain).mockReturnValue(true);
    const store = makeStore();
    const result = captureHook(store, {
      findContainerAtPosition: () => container,
    });
    const { event } = mockDataTransferEvent({ 'application/ice-block': 'svc' });
    result.handleDrop(event);
    expect(mocks.expandBlueprintSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ parentContainerId: 'allowed-parent' }),
    );

    // Denied → parentContainerId undefined.
    vi.mocked(canContain).mockReturnValue(false);
    result.handleDrop(event);
    expect(mocks.expandBlueprintSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ parentContainerId: undefined }),
    );
  });
});

describe('useCanvasDrop — logging side-effects', () => {
  it("logDrop fires with { position, targetContainer, nodeType }", () => {
    const container = fakeContainer({ id: 'logged-parent' });
    const store = makeStore();
    const result = captureHook(store, {
      findContainerAtPosition: () => container,
    });

    const { event } = mockDataTransferEvent({ 'application/ice-resource': 'Network.Vpc' }, 7, 8);
    result.handleDrop(event);

    expect(mocks.logDropSpy).toHaveBeenCalledTimes(1);
    expect(mocks.logDropSpy).toHaveBeenCalledWith({
      position: { x: 7, y: 8 },
      targetContainer: 'logged-parent',
      nodeType: 'Network.Vpc',
    });
  });

  it('logDrop nodeType prefers Group.${type} over block/resource', () => {
    const store = makeStore();
    const result = captureHook(store);
    const { event } = mockDataTransferEvent({
      'application/ice-group': 'AppGroup',
      'application/ice-block': 'svc',
      'application/ice-resource': 'Compute.Vm',
    });
    result.handleDrop(event);

    expect(mocks.logDropSpy).toHaveBeenCalledTimes(1);
    expect(mocks.logDropSpy.mock.calls[0][0]).toMatchObject({
      nodeType: 'Group.AppGroup',
    });
  });

  it('logBlueprint does NOT fire on resource-drop or fallthrough paths', () => {
    const store = makeStore();
    const result = captureHook(store);
    // Resource drop:
    result.handleDrop(mockDataTransferEvent({ 'application/ice-resource': 'X' }).event);
    // Block-without-blueprint (fallthrough):
    mocks.getBlueprintSpy.mockReturnValue(undefined);
    result.handleDrop(mockDataTransferEvent({ 'application/ice-block': 'X' }).event);
    expect(mocks.logBlueprintSpy).not.toHaveBeenCalled();
  });
});

describe('useCanvasDrop — handleDragOver', () => {
  it("calls preventDefault and sets dropEffect to 'move'", () => {
    const store = makeStore();
    const result = captureHook(store);

    const { event, preventDefault, dropEffectRef } = mockDataTransferEvent({});
    result.handleDragOver(event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(dropEffectRef.value).toBe('move');
  });
});
