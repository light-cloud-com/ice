/**
 * SvgCanvas tests — orchestrator composition.
 *
 * The component is an orchestrator over 24 hook calls + 5 sub-components.
 * Tests verify:
 *   1. The hooks are invoked with the right arg shapes (composition).
 *   2. The five sub-components render with the threaded props.
 *   3. The two render branches: empty (no card) vs populated.
 *
 * Pattern: every imported hook is mocked to return a stable shape; every
 * imported sub-component is opaque-marker-mocked.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hooks = vi.hoisted(() => ({
  useClipboard: vi.fn(),
  useExposedServices: vi.fn(() => [] as Array<{ id: string }>),
  useUndoRedo: vi.fn(),
  useCanvasInteractionsBindings: vi.fn(() => ({
    bindCanvas: { onMouseDown: vi.fn(), onMouseMove: vi.fn(), onMouseUp: vi.fn(), onWheel: vi.fn() },
    cursor: 'default',
    screenToCanvas: vi.fn(() => ({ x: 0, y: 0 })),
  })),
  useCanvasMouseRouting: vi.fn(() => ({
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    onMouseLeave: vi.fn(),
  })),
  useRenderCtx: vi.fn(() => ({
    /* eighteen-field bundle */
  })),
  useCanvasValidation: vi.fn(),
  useComputingFlows: vi.fn(),
  useCanvasDimensions: vi.fn(() => ({ width: 800, height: 600 })),
  useCanvasViewport: vi.fn(() => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    lod: 0,
    persistViewport: vi.fn(),
  })),
  usePinnedUserNode: vi.fn((): any => ({
    pinnedUserPos: null,
    setUserNodePos: vi.fn(),
    userConnections: [] as any[],
    nodesWithUserNode: [] as any[],
  })),
  useRenameState: vi.fn(() => ({
    renamingNodeId: null,
    handleNodeDoubleClick: vi.fn(),
    handleRenameCommit: vi.fn(),
    handleRenameCancel: vi.fn(),
  })),
  useCanvasSideEffects: vi.fn(() => ({ overlayDismissed: false, dismissOverlay: vi.fn() })),
  useGhostMode: vi.fn(() => ({
    ghosts: [],
    handleAcceptGhost: vi.fn(),
    handleDismissGhost: vi.fn(),
  })),
  useCanvasDrop: vi.fn(() => ({
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
  })),
  useContainerResize: vi.fn(() => ({
    handleNodeResize: vi.fn(),
  })),
  useContainerMove: vi.fn(() => ({
    handleNodeMove: vi.fn(),
    handleToggleFold: vi.fn(),
  })),
  useDragTargetHighlight: vi.fn(() => ({
    exitingGroupId: null,
    dragOverGroupId: null,
    shiftDraggingNodeIds: [],
    setExitingGroupId: vi.fn(),
    handleDragOverGroup: vi.fn(),
    handleDragEnd: vi.fn(),
  })),
  useConnectionDrawing: vi.fn(() => ({
    drawingConnection: null,
    connectionDragTargets: null,
    handleConnectionPortDown: vi.fn(),
    handleConnectionMove: vi.fn(),
    handleConnectionEnd: vi.fn(),
  })),
  useCanvasData: vi.fn((): any => ({
    nodes: [] as any[],
    edges: [] as any[],
    canvasNodes: [] as any[],
    visibleNodes: [] as any[],
    foldedRemap: {},
    effectiveNodes: [] as any[],
    canvasConnections: [] as any[],
    canvasItems: [] as any[],
    nodeValidationMap: {},
    nodeDepthMap: {},
    sortedNodes: [],
    portMap: {},
  })),
  useCanvasTraversal: vi.fn(() => ({
    getDescendantIds: vi.fn(() => []),
    getAllDescendantIds: vi.fn(() => []),
    findContainerAtPosition: vi.fn(() => null),
  })),
  useCanvasHandlers: vi.fn(() => ({
    hoveredNodeId: null,
    connTooltip: null,
    setConnTooltip: vi.fn(),
    handleDeleteSelected: vi.fn(),
    handleNodeHover: vi.fn(),
    handleConnectionHover: vi.fn(),
    handleEdgeDelete: vi.fn(),
    handleEdgeSelect: vi.fn(),
    handleUpdateNodeData: vi.fn(),
    handlePipelineClick: vi.fn(),
    handleContextMenu: vi.fn(),
    handleCanvasClick: vi.fn(),
  })),
  useCanvasEffects: vi.fn(),
  useCanvasSelectors: vi.fn((): any => ({
    card: null,
    activeCard: null,
    selectedNodes: [] as any[],
    selectedEdges: [] as any[],
    viewLevel: 1,
    animatingNodes: {},
    animatingEdges: {},
    aiCurrentIntent: null,
    pipelineNodeStatus: {},
    edgeStyle: 'bezier' as const,
    validationIssues: [] as any[],
    snapToGrid: false,
    canvasLocked: false,
  })),
}));

const components = vi.hoisted(() => ({
  CanvasContextMenu: vi.fn(() => null),
  ControlsHelpModal: vi.fn(() => null),
  ConnectionTooltip: vi.fn(() => null),
  CanvasDeployBanner: vi.fn(() => null),
  CanvasContent: vi.fn(() => null),
  SocketHoverTooltip: vi.fn(() => null),
  EmptyCanvasOverlay: vi.fn(() => null),
}));

const dispatchSpy = vi.fn();

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useRefStub = <T,>(init: T) => ({ current: init });
  // svg-canvas now calls `useMemo` directly to precompute the orphan
  // node set. The test invokes svg-canvas as a plain function (no
  // renderer), so the real useMemo blows up — stub it to invoke its
  // factory once and return the result, same shape as React's contract.
  const useMemoStub = <T,>(factory: () => T, _deps: unknown[]): T => factory();
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useRef: useRefStub, useMemo: useMemoStub },
    useRef: useRefStub,
    useMemo: useMemoStub,
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => dispatchSpy,
  // Not used by svg-canvas directly — every selector is consumed by mocked
  // sub-hooks. But the orchestrator imports `useDispatch` for the `AppDispatch`
  // typed dispatch slot.
}));

vi.mock('../context/canvas-context-menu', () => ({
  CanvasContextMenu: components.CanvasContextMenu,
}));
vi.mock('../controls-help-modal', () => ({
  ControlsHelpModal: components.ControlsHelpModal,
}));
vi.mock('../connection-tooltip', () => ({
  ConnectionTooltip: components.ConnectionTooltip,
}));
vi.mock('../nodes/_shared/socket-hover-tooltip', () => ({
  SocketHoverTooltip: components.SocketHoverTooltip,
}));
vi.mock('../deploy-banner', () => ({
  CanvasDeployBanner: components.CanvasDeployBanner,
}));
vi.mock('../empty-canvas-overlay', () => ({
  EmptyCanvasOverlay: components.EmptyCanvasOverlay,
}));
vi.mock('../canvas-renderer/canvas-content', () => ({
  CanvasContent: components.CanvasContent,
}));

vi.mock('../../../../shared/hooks/use-clipboard', () => ({
  useClipboard: hooks.useClipboard,
}));
vi.mock('../../../../shared/hooks/use-exposed-services', () => ({
  useExposedServices: hooks.useExposedServices,
}));
vi.mock('../../../../shared/hooks/use-undo-redo', () => ({
  useUndoRedo: hooks.useUndoRedo,
}));
vi.mock('../../hooks/use-canvas-interactions-bindings', () => ({
  useCanvasInteractionsBindings: hooks.useCanvasInteractionsBindings,
}));
vi.mock('../../hooks/use-canvas-mouse-routing', () => ({
  useCanvasMouseRouting: hooks.useCanvasMouseRouting,
}));
vi.mock('../../hooks/use-render-ctx', () => ({
  useRenderCtx: hooks.useRenderCtx,
}));
vi.mock('../../hooks/use-canvas-validation', () => ({
  useCanvasValidation: hooks.useCanvasValidation,
}));
vi.mock('../../hooks/use-computing-flows', () => ({
  useComputingFlows: hooks.useComputingFlows,
}));
vi.mock('../../hooks/use-canvas-resize', () => ({
  useCanvasDimensions: hooks.useCanvasDimensions,
}));
vi.mock('../../hooks/use-canvas-viewport', () => ({
  useCanvasViewport: hooks.useCanvasViewport,
}));
vi.mock('../../hooks/use-pinned-user-node', () => ({
  usePinnedUserNode: hooks.usePinnedUserNode,
}));
vi.mock('../../hooks/use-rename-state', () => ({
  useRenameState: hooks.useRenameState,
}));
vi.mock('../../hooks/use-canvas-side-effects', () => ({
  useCanvasSideEffects: hooks.useCanvasSideEffects,
}));
vi.mock('../../hooks/use-ghost-mode', () => ({
  useGhostMode: hooks.useGhostMode,
}));
vi.mock('../../hooks/use-canvas-drop', () => ({
  useCanvasDrop: hooks.useCanvasDrop,
}));
vi.mock('../../hooks/use-container-resize', () => ({
  useContainerResize: hooks.useContainerResize,
}));
vi.mock('../../hooks/use-container-move', () => ({
  useContainerMove: hooks.useContainerMove,
}));
vi.mock('../../hooks/use-drag-target-highlight', () => ({
  useDragTargetHighlight: hooks.useDragTargetHighlight,
}));
vi.mock('../../hooks/use-connection-drawing', () => ({
  useConnectionDrawing: hooks.useConnectionDrawing,
}));
vi.mock('../../hooks/use-canvas-data', () => ({
  useCanvasData: hooks.useCanvasData,
}));
vi.mock('../../hooks/use-canvas-traversal', () => ({
  useCanvasTraversal: hooks.useCanvasTraversal,
}));
vi.mock('../../hooks/use-canvas-handlers', () => ({
  useCanvasHandlers: hooks.useCanvasHandlers,
}));
vi.mock('../../hooks/use-canvas-effects', () => ({
  useCanvasEffects: hooks.useCanvasEffects,
}));
vi.mock('../../hooks/use-canvas-selectors', () => ({
  useCanvasSelectors: hooks.useCanvasSelectors,
}));

import { SvgCanvas } from '../svg-canvas';

// ─── Tree walker (mocks-as-leaves) ──────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

const KNOWN_MOCKS = [
  components.CanvasContextMenu,
  components.ControlsHelpModal,
  components.ConnectionTooltip,
  components.CanvasDeployBanner,
  components.CanvasContent,
] as const;

function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if ((KNOWN_MOCKS as readonly unknown[]).includes(node.type)) {
    return;
  }
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
    return;
  }
  yield* walk(node.props.children);
}

function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

const callRender = (props: React.ComponentProps<typeof SvgCanvas> = {}): unknown =>
  (SvgCanvas as (p: typeof props) => unknown)(props);

beforeEach(() => {
  for (const h of Object.values(hooks)) {
    (h as { mockClear?: () => void }).mockClear?.();
  }
  for (const c of Object.values(components)) {
    (c as { mockClear?: () => void }).mockClear?.();
  }
  dispatchSpy.mockReset();
  // Reset any per-call return-value overrides.
  hooks.useCanvasSelectors.mockReturnValue({
    card: null,
    activeCard: null,
    selectedNodes: [],
    selectedEdges: [],
    viewLevel: 1,
    animatingNodes: {},
    animatingEdges: {},
    aiCurrentIntent: null,
    pipelineNodeStatus: {},
    edgeStyle: 'bezier',
    validationIssues: [],
    snapToGrid: false,
    canvasLocked: false,
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SvgCanvas — top-level rendering', () => {
  it('renders a wrapping div with id="ice-canvas-svg" and data-testid="svg-canvas"', () => {
    const tree = callRender();
    const wrapper = findFirst(tree, (el) => el.type === 'div' && (el.props as { id?: string }).id === 'ice-canvas-svg');
    expect(wrapper).toBeDefined();
    expect((wrapper!.props as { ['data-testid']?: string })['data-testid']).toBe('svg-canvas');
  });

  it('renders the CanvasDeployBanner with activeCard.id when present', () => {
    hooks.useCanvasSelectors.mockReturnValue({
      card: null,
      activeCard: { id: 'card-active' },
      selectedNodes: [],
      selectedEdges: [],
      viewLevel: 1,
      animatingNodes: {},
      animatingEdges: {},
      aiCurrentIntent: null,
      pipelineNodeStatus: {},
      edgeStyle: 'bezier',
      validationIssues: [],
      snapToGrid: false,
      canvasLocked: false,
    });
    const tree = callRender();
    const banner = findFirst(tree, (el) => el.type === components.CanvasDeployBanner);
    expect(banner).toBeDefined();
    expect((banner!.props as { cardId?: string }).cardId).toBe('card-active');
  });

  it('renders CanvasDeployBanner with cardId=undefined when activeCard is null', () => {
    const tree = callRender();
    const banner = findFirst(tree, (el) => el.type === components.CanvasDeployBanner);
    expect(banner).toBeDefined();
    expect((banner!.props as { cardId?: string }).cardId).toBeUndefined();
  });

  it('renders the ControlsHelpModal', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === components.ControlsHelpModal)).toBeDefined();
  });

  it('renders the ConnectionTooltip with connTooltip info', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === components.ConnectionTooltip)).toBeDefined();
  });

  it('renders the CanvasContextMenu', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === components.CanvasContextMenu)).toBeDefined();
  });

  it('renders the CanvasContent', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === components.CanvasContent)).toBeDefined();
  });

  it('renders an inner <svg> with width/height from useCanvasDimensions', () => {
    hooks.useCanvasDimensions.mockReturnValue({ width: 1024, height: 768 });
    const tree = callRender();
    const svg = findFirst(tree, (el) => el.type === 'svg');
    expect(svg).toBeDefined();
    expect((svg!.props as { width?: number }).width).toBe(1024);
    expect((svg!.props as { height?: number }).height).toBe(768);
  });

  it('SVG cursor is "crosshair" when drawingConnection is set, otherwise the bindCanvas cursor', () => {
    hooks.useCanvasInteractionsBindings.mockReturnValueOnce({
      bindCanvas: {} as never,
      cursor: 'pointer',
      screenToCanvas: vi.fn(),
    });
    const tree1 = callRender();
    const svg1 = findFirst(tree1, (el) => el.type === 'svg')!;
    expect((svg1.props as { style?: { cursor?: string } }).style?.cursor).toBe('pointer');

    hooks.useConnectionDrawing.mockReturnValueOnce({
      drawingConnection: { startNodeId: 'a', startPort: 'top', currentPos: { x: 0, y: 0 } } as never,
      connectionDragTargets: null,
      handleConnectionPortDown: vi.fn(),
      handleConnectionMove: vi.fn(),
      handleConnectionEnd: vi.fn(),
    });
    const tree2 = callRender();
    const svg2 = findFirst(tree2, (el) => el.type === 'svg')!;
    expect((svg2.props as { style?: { cursor?: string } }).style?.cursor).toBe('crosshair');
  });
});

describe('SvgCanvas — hook composition', () => {
  it('useCanvasSelectors is called with the cardId prop', () => {
    callRender({ cardId: 'card-foo' });
    expect(hooks.useCanvasSelectors).toHaveBeenCalledWith({ cardId: 'card-foo' });
  });

  it('useCanvasViewport is called with cardId + paneId', () => {
    callRender({ cardId: 'c1', paneId: 'p2' });
    expect(hooks.useCanvasViewport).toHaveBeenCalledWith({
      cardId: 'c1',
      paneId: 'p2',
    });
  });

  it('useCanvasData is fed the card + view-level inputs', () => {
    const card = { id: 'c-1' };
    hooks.useCanvasSelectors.mockReturnValueOnce({
      card,
      activeCard: card,
      selectedNodes: ['a'],
      selectedEdges: [],
      viewLevel: 2,
      animatingNodes: {},
      animatingEdges: {},
      aiCurrentIntent: null,
      pipelineNodeStatus: { x: { state: 'ok' } },
      edgeStyle: 'bezier' as const,
      validationIssues: [{ id: 'v1' }],
      snapToGrid: false,
      canvasLocked: false,
    });
    callRender();
    expect(hooks.useCanvasData).toHaveBeenCalledWith(
      expect.objectContaining({
        card,
        viewLevel: 2,
        validationIssues: [{ id: 'v1' }],
        selectedNodes: ['a'],
      }),
    );
  });

  it('useCanvasTraversal receives visibleNodes + canvasNodes', () => {
    hooks.useCanvasData.mockReturnValueOnce({
      nodes: [],
      edges: [],
      canvasNodes: [{ id: 'cn-1' }] as never,
      visibleNodes: [{ id: 'vn-1' }] as never,
      foldedRemap: {},
      effectiveNodes: [],
      canvasConnections: [],
      canvasItems: [],
      nodeValidationMap: {},
      nodeDepthMap: {},
      sortedNodes: [],
      portMap: {},
    });
    callRender();
    expect(hooks.useCanvasTraversal).toHaveBeenCalledWith({
      visibleNodes: [{ id: 'vn-1' }],
      canvasNodes: [{ id: 'cn-1' }],
    });
  });

  it('useExposedServices is called with effectiveNodes/edges/canvasNodes', () => {
    callRender();
    expect(hooks.useExposedServices).toHaveBeenCalled();
  });

  it('useCanvasSideEffects receives a wide bundle including dispatch', () => {
    callRender();
    const lastArgs = (hooks.useCanvasSideEffects as any).mock.calls[0][0];
    expect(lastArgs).toEqual(
      expect.objectContaining({
        dispatch: dispatchSpy,
      }),
    );
  });

  it('useDragTargetHighlight receives visibleNodes + nodes + selectedNodes + getDescendantIds', () => {
    callRender();
    const a = (hooks.useDragTargetHighlight as any).mock.calls[0][0];
    expect(a).toEqual(
      expect.objectContaining({
        visibleNodes: expect.any(Array),
        nodes: expect.any(Array),
        selectedNodes: expect.any(Array),
        getDescendantIds: expect.any(Function),
      }),
    );
  });

  it('useContainerMove receives the setExitingGroupId callback from useDragTargetHighlight', () => {
    const setExitingGroupId = vi.fn();
    hooks.useDragTargetHighlight.mockReturnValueOnce({
      exitingGroupId: null,
      dragOverGroupId: null,
      shiftDraggingNodeIds: [],
      setExitingGroupId,
      handleDragOverGroup: vi.fn(),
      handleDragEnd: vi.fn(),
    });
    callRender();
    const a = (hooks.useContainerMove as any).mock.calls[0][0];
    expect(a).toEqual(
      expect.objectContaining({
        setExitingGroupId,
      }),
    );
  });

  it('useCanvasInteractionsBindings receives the move/resize/dragOver/dragEnd handlers', () => {
    const handleNodeMove = vi.fn();
    const handleNodeResize = vi.fn();
    const handleDragOverGroup = vi.fn();
    const handleDragEnd = vi.fn();
    hooks.useContainerMove.mockReturnValueOnce({
      handleNodeMove,
      handleToggleFold: vi.fn(),
    });
    hooks.useContainerResize.mockReturnValueOnce({
      handleNodeResize,
    });
    hooks.useDragTargetHighlight.mockReturnValueOnce({
      exitingGroupId: null,
      dragOverGroupId: null,
      shiftDraggingNodeIds: [],
      setExitingGroupId: vi.fn(),
      handleDragOverGroup,
      handleDragEnd,
    });
    callRender();
    const a = (hooks.useCanvasInteractionsBindings as any).mock.calls[0][0];
    expect(a.onItemMove).toBe(handleNodeMove);
    expect(a.onItemResize).toBe(handleNodeResize);
    expect(a.onDragOverGroup).toBe(handleDragOverGroup);
    expect(a.onDragEnd).toBe(handleDragEnd);
  });

  it('useCanvasInteractionsBindings receives the snapToGrid + locked flags', () => {
    hooks.useCanvasSelectors.mockReturnValueOnce({
      card: null,
      activeCard: null,
      selectedNodes: [],
      selectedEdges: [],
      viewLevel: 1,
      animatingNodes: {},
      animatingEdges: {},
      aiCurrentIntent: null,
      pipelineNodeStatus: {},
      edgeStyle: 'bezier',
      validationIssues: [],
      snapToGrid: true,
      canvasLocked: true,
    });
    callRender();
    const a = (hooks.useCanvasInteractionsBindings as any).mock.calls[0][0];
    expect(a.snapToGrid).toBe(true);
    expect(a.locked).toBe(true);
  });

  it('useCanvasInteractionsBindings receives the persistViewport callback as onViewportChange', () => {
    const persistViewport = vi.fn();
    hooks.useCanvasViewport.mockReturnValueOnce({
      viewport: { x: 0, y: 0, zoom: 1 },
      lod: 0,
      persistViewport,
    });
    callRender();
    const a = (hooks.useCanvasInteractionsBindings as any).mock.calls[0][0];
    expect(a.onViewportChange).toBe(persistViewport);
  });

  it('useCanvasDrop receives screenToCanvas, findContainerAtPosition, nodes, edges', () => {
    const screenToCanvas = vi.fn();
    const findContainerAtPosition = vi.fn();
    hooks.useCanvasInteractionsBindings.mockReturnValueOnce({
      bindCanvas: {} as never,
      cursor: 'default',
      screenToCanvas,
    });
    hooks.useCanvasTraversal.mockReturnValueOnce({
      getDescendantIds: vi.fn(() => []),
      getAllDescendantIds: vi.fn(() => []),
      findContainerAtPosition,
    });
    callRender();
    const a = (hooks.useCanvasDrop as any).mock.calls[0][0];
    expect(a.screenToCanvas).toBe(screenToCanvas);
    expect(a.findContainerAtPosition).toBe(findContainerAtPosition);
  });

  it('useConnectionDrawing receives effectiveNodes + card + screenToCanvas', () => {
    callRender();
    expect(hooks.useConnectionDrawing).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveNodes: expect.any(Array),
        screenToCanvas: expect.any(Function),
      }),
    );
  });

  it('useCanvasMouseRouting receives the connection-drawing handlers', () => {
    const handleConnectionPortDown = vi.fn();
    const handleConnectionMove = vi.fn();
    const handleConnectionEnd = vi.fn();
    hooks.useConnectionDrawing.mockReturnValueOnce({
      drawingConnection: null,
      connectionDragTargets: null,
      handleConnectionPortDown,
      handleConnectionMove,
      handleConnectionEnd,
    });
    callRender();
    const a = (hooks.useCanvasMouseRouting as any).mock.calls[0][0];
    expect(a.handleConnectionPortDown).toBe(handleConnectionPortDown);
    expect(a.handleConnectionMove).toBe(handleConnectionMove);
    expect(a.handleConnectionEnd).toBe(handleConnectionEnd);
  });

  it('useCanvasEffects receives cardId via card?.id', () => {
    hooks.useCanvasSelectors.mockReturnValueOnce({
      card: { id: 'card-eff' },
      activeCard: null,
      selectedNodes: [],
      selectedEdges: [],
      viewLevel: 1,
      animatingNodes: {},
      animatingEdges: {},
      aiCurrentIntent: null,
      pipelineNodeStatus: {},
      edgeStyle: 'bezier',
      validationIssues: [],
      snapToGrid: false,
      canvasLocked: false,
    });
    callRender();
    const a = (hooks.useCanvasEffects as any).mock.calls[0][0];
    expect(a.cardId).toBe('card-eff');
  });

  it('useCanvasEffects receives undefined cardId when card is null', () => {
    callRender();
    const a = (hooks.useCanvasEffects as any).mock.calls[0][0];
    expect(a.cardId).toBeUndefined();
  });

  it('useRenderCtx receives the eighteen-field bundle including handlers', () => {
    callRender();
    const a = (hooks.useRenderCtx as any).mock.calls[0][0];
    expect(a).toEqual(
      expect.objectContaining({
        sortedNodes: expect.any(Array),
        selectedNodes: expect.any(Array),
        zoom: 1,
        handleToggleFold: expect.any(Function),
        handleNodeHover: expect.any(Function),
      }),
    );
  });

  it('useCanvasHandlers receives selectedNodes/viewport/svgRef/onFocus', () => {
    const onFocus = vi.fn();
    callRender({ onFocus });
    const a = (hooks.useCanvasHandlers as any).mock.calls[0][0];
    expect(a.onFocus).toBe(onFocus);
    expect(a.selectedNodes).toEqual([]);
    expect(a.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('SvgCanvas — passive hooks (no return)', () => {
  it('calls useClipboard exactly once', () => {
    callRender();
    expect(hooks.useClipboard).toHaveBeenCalledTimes(1);
  });

  it('calls useUndoRedo exactly once', () => {
    callRender();
    expect(hooks.useUndoRedo).toHaveBeenCalledTimes(1);
  });

  it('calls useCanvasValidation exactly once', () => {
    callRender();
    expect(hooks.useCanvasValidation).toHaveBeenCalledTimes(1);
  });

  it('calls useComputingFlows exactly once', () => {
    callRender();
    expect(hooks.useComputingFlows).toHaveBeenCalledTimes(1);
  });
});

describe('SvgCanvas — CanvasContent prop wiring', () => {
  it('threads sortedNodes/effectiveNodes/canvasConnections through to CanvasContent', () => {
    hooks.useCanvasData.mockReturnValueOnce({
      nodes: [{ id: 'n' }],
      edges: [{ id: 'e' }],
      canvasNodes: [],
      visibleNodes: [],
      foldedRemap: {},
      effectiveNodes: [{ id: 'effN' }] as never,
      canvasConnections: [{ id: 'cc' }] as never,
      canvasItems: [],
      nodeValidationMap: {},
      nodeDepthMap: {},
      sortedNodes: [{ id: 'sN' }] as never,
      portMap: { sN: {} },
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.sortedNodes).toEqual([{ id: 'sN' }]);
    expect(cc.props.effectiveNodes).toEqual([{ id: 'effN' }]);
    expect(cc.props.canvasConnections).toEqual([{ id: 'cc' }]);
  });

  it('passes ghosts + handlers from useGhostMode to CanvasContent', () => {
    const handleAcceptGhost = vi.fn();
    const handleDismissGhost = vi.fn();
    hooks.useGhostMode.mockReturnValueOnce({
      ghosts: [{ id: 'g1' }] as never,
      handleAcceptGhost,
      handleDismissGhost,
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.ghosts).toEqual([{ id: 'g1' }]);
    expect(cc.props.onAcceptGhost).toBe(handleAcceptGhost);
    expect(cc.props.onDismissGhost).toBe(handleDismissGhost);
  });

  it('threads pinnedUserPos/setUserNodePos/userConnections from usePinnedUserNode', () => {
    const setUserNodePos = vi.fn();
    hooks.usePinnedUserNode.mockReturnValueOnce({
      pinnedUserPos: { x: 10, y: 20 },
      setUserNodePos,
      userConnections: [{ id: 'uc' }] as never,
      nodesWithUserNode: [{ id: 'nuw' }] as never,
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.pinnedUserPos).toEqual({ x: 10, y: 20 });
    expect(cc.props.setUserNodePos).toBe(setUserNodePos);
    expect(cc.props.userConnections).toEqual([{ id: 'uc' }]);
    expect(cc.props.nodesWithUserNode).toEqual([{ id: 'nuw' }]);
  });

  it('showVirtualUserNode is false when an explicit Network.PublicEndpoint exists in canvasNodes', () => {
    hooks.useCanvasData.mockReturnValueOnce({
      nodes: [],
      edges: [],
      canvasNodes: [{ id: 'pe', data: { iceType: 'Network.PublicEndpoint' } }] as never,
      visibleNodes: [],
      foldedRemap: {},
      effectiveNodes: [],
      canvasConnections: [],
      canvasItems: [],
      nodeValidationMap: {},
      nodeDepthMap: {},
      sortedNodes: [],
      portMap: {},
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.showVirtualUserNode).toBe(false);
  });

  it('showVirtualUserNode is true when no explicit Network.PublicEndpoint exists', () => {
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.showVirtualUserNode).toBe(true);
  });

  it('showVirtualUserNode is true when canvasNodes have other iceTypes only', () => {
    hooks.useCanvasData.mockReturnValueOnce({
      nodes: [],
      edges: [],
      canvasNodes: [{ id: 'x', data: { iceType: 'Compute.Service' } }] as never,
      visibleNodes: [],
      foldedRemap: {},
      effectiveNodes: [],
      canvasConnections: [],
      canvasItems: [],
      nodeValidationMap: {},
      nodeDepthMap: {},
      sortedNodes: [],
      portMap: {},
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.showVirtualUserNode).toBe(true);
  });

  it('threads renderCtx into CanvasContent', () => {
    const renderCtx = { tag: 'mock' };
    hooks.useRenderCtx.mockReturnValueOnce(renderCtx);
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.renderCtx).toBe(renderCtx);
  });

  it('threads drawingConnection / connectionDragTargets through to CanvasContent', () => {
    hooks.useConnectionDrawing.mockReturnValueOnce({
      drawingConnection: { startNodeId: 'a' } as never,
      connectionDragTargets: new Map([['a', { side: 'top' }]]) as never,
      handleConnectionPortDown: vi.fn(),
      handleConnectionMove: vi.fn(),
      handleConnectionEnd: vi.fn(),
    });
    const tree = callRender();
    const cc = findFirst(tree, (el) => el.type === components.CanvasContent)!;
    expect(cc.props.drawingConnection).toEqual({ startNodeId: 'a' });
    expect(cc.props.connectionDragTargets).toBeInstanceOf(Map);
  });
});

describe('SvgCanvas — outer-div / SVG event wiring', () => {
  it('outer div onDrop calls handleDrop from useCanvasDrop', () => {
    const handleDrop = vi.fn();
    hooks.useCanvasDrop.mockReturnValueOnce({
      handleDrop,
      handleDragOver: vi.fn(),
    });
    const tree = callRender();
    const wrapper = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props as { id?: string }).id === 'ice-canvas-svg',
    )!;
    expect(wrapper.props.onDrop).toBe(handleDrop);
  });

  it('outer div onDragOver calls handleDragOver from useCanvasDrop', () => {
    const handleDragOver = vi.fn();
    hooks.useCanvasDrop.mockReturnValueOnce({
      handleDrop: vi.fn(),
      handleDragOver,
    });
    const tree = callRender();
    const wrapper = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props as { id?: string }).id === 'ice-canvas-svg',
    )!;
    expect(wrapper.props.onDragOver).toBe(handleDragOver);
  });

  it('outer div onMouseDown is the handleCanvasClick from useCanvasHandlers', () => {
    const handleCanvasClick = vi.fn();
    hooks.useCanvasHandlers.mockReturnValueOnce({
      hoveredNodeId: null,
      connTooltip: null,
      setConnTooltip: vi.fn(),
      handleDeleteSelected: vi.fn(),
      handleNodeHover: vi.fn(),
      handleConnectionHover: vi.fn(),
      handleEdgeDelete: vi.fn(),
      handleEdgeSelect: vi.fn(),
      handleUpdateNodeData: vi.fn(),
      handlePipelineClick: vi.fn(),
      handleContextMenu: vi.fn(),
      handleCanvasClick,
    });
    const tree = callRender();
    const wrapper = findFirst(
      tree,
      (el) => el.type === 'div' && (el.props as { id?: string }).id === 'ice-canvas-svg',
    )!;
    expect(wrapper.props.onMouseDown).toBe(handleCanvasClick);
  });

  it('SVG inherits the mouse-handlers bundle from useCanvasMouseRouting', () => {
    const onMouseDown = vi.fn();
    const onMouseMove = vi.fn();
    hooks.useCanvasMouseRouting.mockReturnValueOnce({
      onMouseDown,
      onMouseMove,
      onMouseUp: vi.fn(),
      onMouseLeave: vi.fn(),
    });
    const tree = callRender();
    const svg = findFirst(tree, (el) => el.type === 'svg')!;
    expect(svg.props.onMouseDown).toBe(onMouseDown);
    expect(svg.props.onMouseMove).toBe(onMouseMove);
  });
});
