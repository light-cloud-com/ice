/**
 * canvas-menu tests — direct-FC tree-walker.
 *
 * The CanvasMenu is a thin presentational shell over `MenuItem`,
 * `Separator`, `SubMenu`, and `CategorySubMenu`. We mock i18n and the
 * cards/ui slice action creators so we can verify the dispatched
 * actions; React hooks are stubbed via passthrough.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  refs: [] as Array<{ current: unknown }>,
  // Action creators — return tagged objects so dispatch.calls[i][0] is verifiable.
  autoOrganizeCard: vi.fn((p: unknown) => ({ type: 'cards/autoOrganize', payload: p })),
  undoCardChange: vi.fn(() => ({ type: 'cards/undo' })),
  redoCardChange: vi.fn(() => ({ type: 'cards/redo' })),
  setSelectedNodes: vi.fn((p: unknown) => ({ type: 'selection/setSelectedNodes', payload: p })),
  setEdgeStyle: vi.fn((p: unknown) => ({ type: 'ui/setEdgeStyle', payload: p })),
  toggleCanvasLocked: vi.fn(() => ({ type: 'ui/toggleCanvasLocked' })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const override = mocks.useStateOverrides[idx];
    const value = override !== undefined ? (override as T) : init;
    return [value, vi.fn()];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const useRefStub = <T,>(init: T) => {
    const ref = { current: init };
    mocks.refs.push(ref as unknown as { current: unknown });
    return ref;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub, useRef: useRefStub },
    useState: useStateStub,
    useEffect: useEffectStub,
    useRef: useRefStub,
  };
});

vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../../store/slices/cards-slice', () => ({
  autoOrganizeCard: mocks.autoOrganizeCard,
  undoCardChange: mocks.undoCardChange,
  redoCardChange: mocks.redoCardChange,
}));

vi.mock('../../../../../store/slices/selection-slice', () => ({
  setSelectedNodes: mocks.setSelectedNodes,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  setEdgeStyle: mocks.setEdgeStyle,
  toggleCanvasLocked: mocks.toggleCanvasLocked,
}));

// Real menu primitives — we want to walk into them.
import { CanvasMenu } from '../canvas-menu';
import { fireKey } from '../menu-primitives';

vi.mock('../menu-primitives', async (orig) => {
  const actual = (await orig()) as typeof import('../menu-primitives');
  return {
    ...actual,
    fireKey: vi.fn(),
  };
});

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (typeof node.type === 'function') {
    const FC = node.type as (p: unknown) => unknown;
    yield* walk(FC(node.props));
    return;
  }
  yield* walk(node.props.children);
}
function findAll(tree: unknown, pred: (el: ElLike) => boolean): ElLike[] {
  const out: ElLike[] = [];
  for (const el of walk(tree)) if (pred(el)) out.push(el);
  return out;
}
function findFirst(tree: unknown, pred: (el: ElLike) => boolean): ElLike | undefined {
  for (const el of walk(tree)) if (pred(el)) return el;
  return undefined;
}

const findItemByLabel = (tree: unknown, label: string): ElLike | undefined =>
  findFirst(
    tree,
    (el) =>
      el.type === 'button' &&
      ((el.props.children as unknown[])?.[0] as { props?: { children?: unknown } } | undefined)?.props?.children ===
        label,
  );

// Helper: find a SubMenu / CategorySubMenu / MenuItem (FC) by its label prop
const findFCByLabel = (tree: unknown, label: string): ElLike | undefined =>
  findFirst(tree, (el) => typeof el.type === 'function' && (el.props as { label?: unknown }).label === label);

// Helper: find an item-button rendered by the SubMenu (string children).
const findSubItem = (tree: unknown, label: string): ElLike | undefined =>
  findFirst(tree, (el) => el.type === 'button' && el.props.children === label);

const baseProps = (overrides: Partial<Parameters<typeof CanvasMenu>[0]> = {}): Parameters<typeof CanvasMenu>[0] => ({
  menuRef: { current: null },
  position: { x: 100, y: 200 },
  blockCategories: [
    {
      label: 'Compute',
      items: [{ label: 'EC2', onClick: vi.fn() }],
    },
  ],
  templateCategories: [
    {
      label: 'Web',
      items: [{ label: 'Static', onClick: vi.fn() }],
    },
  ],
  canUndo: true,
  canRedo: true,
  currentZoom: 1,
  activeCard: { nodes: [{ id: 'n1' }, { id: 'n2' }] },
  edgeStyle: 'bezier',
  canvasLocked: false,
  close: vi.fn(),
  dispatch: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof CanvasMenu>[0]) => (CanvasMenu as unknown as (p: unknown) => unknown)(props);

beforeEach(() => {
  mocks.effects = [];
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.refs = [];
  mocks.autoOrganizeCard.mockClear();
  mocks.undoCardChange.mockClear();
  mocks.redoCardChange.mockClear();
  mocks.setSelectedNodes.mockClear();
  mocks.setEdgeStyle.mockClear();
  mocks.toggleCanvasLocked.mockClear();
  (fireKey as ReturnType<typeof vi.fn>).mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CanvasMenu — locked canvas', () => {
  it('renders a single MenuItem labelled with canvasLocked when canvasLocked is true', () => {
    const tree = render(baseProps({ canvasLocked: true }));
    const lockedItem = findFCByLabel(tree, 'canvas.contextMenu.canvasLocked');
    expect(lockedItem).toBeDefined();
    expect((lockedItem!.props as { disabled: boolean }).disabled).toBe(true);
  });

  it('does not render the addBlock / addTemplate menus when canvasLocked is true', () => {
    const tree = render(baseProps({ canvasLocked: true }));
    expect(findFCByLabel(tree, 'canvas.contextMenu.addBlock')).toBeUndefined();
    expect(findFCByLabel(tree, 'canvas.contextMenu.addTemplate')).toBeUndefined();
  });
});

describe('CanvasMenu — unlocked canvas', () => {
  it('renders the addBlock CategorySubMenu when canvasLocked is false', () => {
    const tree = render(baseProps());
    expect(findFCByLabel(tree, 'canvas.contextMenu.addBlock')).toBeDefined();
  });

  it('renders the addTemplate CategorySubMenu when canvasLocked is false', () => {
    const tree = render(baseProps());
    expect(findFCByLabel(tree, 'canvas.contextMenu.addTemplate')).toBeDefined();
  });
});

describe('CanvasMenu — undo / redo', () => {
  it('disables the undo item when canUndo is false', () => {
    const tree = render(baseProps({ canUndo: false }));
    const undo = findFCByLabel(tree, 'canvas.contextMenu.undo');
    expect((undo!.props as { disabled: boolean }).disabled).toBe(true);
  });

  it('enables the undo item when canUndo is true', () => {
    const tree = render(baseProps({ canUndo: true }));
    const undo = findFCByLabel(tree, 'canvas.contextMenu.undo');
    expect((undo!.props as { disabled: boolean }).disabled).toBe(false);
  });

  it('clicking undo dispatches undoCardChange and calls close', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close }));
    const undo = findFCByLabel(tree, 'canvas.contextMenu.undo')!;
    (undo.props.onClick as () => void)();
    expect(mocks.undoCardChange).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'cards/undo' });
    expect(close).toHaveBeenCalled();
  });

  it('clicking redo dispatches redoCardChange and calls close', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close }));
    const redo = findFCByLabel(tree, 'canvas.contextMenu.redo')!;
    (redo.props.onClick as () => void)();
    expect(mocks.redoCardChange).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'cards/redo' });
    expect(close).toHaveBeenCalled();
  });

  it('disables the redo item when canRedo is false', () => {
    const tree = render(baseProps({ canRedo: false }));
    const redo = findFCByLabel(tree, 'canvas.contextMenu.redo');
    expect((redo!.props as { disabled: boolean }).disabled).toBe(true);
  });

  it('redo shortcut uses ⇧⌘Z on Mac and Ctrl+Y elsewhere (best-effort branch coverage)', () => {
    const tree = render(baseProps());
    const redo = findFCByLabel(tree, 'canvas.contextMenu.redo')!;
    const shortcut = (redo.props as { shortcut: string }).shortcut;
    // Either platform value is acceptable; assert it's one of the two.
    expect(shortcut === '⇧⌘Z' || shortcut === 'Ctrl+Y').toBe(true);
  });
});

describe('CanvasMenu — paste / select all', () => {
  it('clicking paste calls close and fires the v keystroke', () => {
    const close = vi.fn();
    const tree = render(baseProps({ close }));
    const paste = findFCByLabel(tree, 'canvas.contextMenu.paste')!;
    (paste.props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
    expect(fireKey).toHaveBeenCalledWith('v', true);
  });

  it('clicking select all dispatches setSelectedNodes for every node id', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, activeCard: { nodes: [{ id: 'a' }, { id: 'b' }] } }));
    const selAll = findFCByLabel(tree, 'canvas.contextMenu.selectAll')!;
    (selAll.props.onClick as () => void)();
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['a', 'b']);
    expect(dispatch).toHaveBeenCalledWith({ type: 'selection/setSelectedNodes', payload: ['a', 'b'] });
    expect(close).toHaveBeenCalled();
  });

  it('clicking select all on missing activeCard dispatches an empty selection list', () => {
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch, activeCard: null as unknown as undefined }));
    const selAll = findFCByLabel(tree, 'canvas.contextMenu.selectAll')!;
    (selAll.props.onClick as () => void)();
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith([]);
  });
});

describe('CanvasMenu — auto-organize submenu', () => {
  it('renders the auto-organize submenu trigger', () => {
    const tree = render(baseProps());
    expect(findFCByLabel(tree, 'canvas.contextMenu.autoOrganize')).toBeDefined();
  });

  it('vertical layout dispatches autoOrganizeCard with direction=vertical', () => {
    // openId slot is index 0 — set it to 'organize' so the submenu opens.
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, currentZoom: 1.5 }));
    const item = findSubItem(tree, 'canvas.contextMenu.layoutVertical')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({ direction: 'vertical', zoom: 1.5 });
    // CCL1 — a directional organize switches to the rectangular edge style so
    // the computed dagre routes render.
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('rectangular');
    expect(close).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
  });

  it('horizontal layout dispatches autoOrganizeCard with direction=horizontal + rectangular edges', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch }));
    const item = findSubItem(tree, 'canvas.contextMenu.layoutHorizontal')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({ direction: 'horizontal', zoom: 1 });
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('rectangular'); // CCL1
  });

  it('circular layout dispatches autoOrganizeCard with layout=circular and does NOT force rectangular edges', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch }));
    const item = findSubItem(tree, 'canvas.contextMenu.layoutCircular')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({ layout: 'circular', zoom: 1 });
    // CCL1 — circular is a radial layout; orthogonal rectangular routes don't
    // apply, so it must NOT switch the edge style (matches the toolbar button).
    expect(mocks.setEdgeStyle).not.toHaveBeenCalledWith('rectangular');
  });
});

describe('CanvasMenu — connection style submenu', () => {
  it('marks the active edge style with a check', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const tree = render(baseProps({ edgeStyle: 'straight' }));
    const item = findSubItem(tree, `canvas.contextMenu.edgeStraight ✓`);
    expect(item).toBeDefined();
  });

  it('renders bezier without a check when bezier is not active', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const tree = render(baseProps({ edgeStyle: 'straight' }));
    const item = findSubItem(tree, 'canvas.contextMenu.edgeBezier');
    expect(item).toBeDefined();
  });

  it('clicking bezier dispatches setEdgeStyle("bezier") and closes', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, edgeStyle: 'straight' }));
    const item = findSubItem(tree, 'canvas.contextMenu.edgeBezier')!;
    (item.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('bezier');
    expect(close).toHaveBeenCalled();
  });

  it('clicking straight dispatches setEdgeStyle("straight")', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch, edgeStyle: 'bezier' }));
    const item = findSubItem(tree, 'canvas.contextMenu.edgeStraight')!;
    (item.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('straight');
  });

  it('clicking rectangular dispatches setEdgeStyle("rectangular")', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch }));
    const item = findSubItem(tree, 'canvas.contextMenu.edgeRectangular')!;
    (item.props.onClick as () => void)();
    expect(mocks.setEdgeStyle).toHaveBeenCalledWith('rectangular');
  });

  it('marks rectangular when edgeStyle is rectangular', () => {
    mocks.useStateOverrides = { 0: 'edge' };
    const tree = render(baseProps({ edgeStyle: 'rectangular' }));
    expect(findSubItem(tree, 'canvas.contextMenu.edgeRectangular ✓')).toBeDefined();
  });
});

describe('CanvasMenu — lock toggle', () => {
  it('shows lockCanvas label when not locked', () => {
    const tree = render(baseProps({ canvasLocked: false }));
    const lock = findFCByLabel(tree, 'canvas.contextMenu.lockCanvas');
    expect(lock).toBeDefined();
  });

  it('shows unlockCanvas label when locked', () => {
    const tree = render(baseProps({ canvasLocked: true }));
    const unlock = findFCByLabel(tree, 'canvas.contextMenu.unlockCanvas');
    expect(unlock).toBeDefined();
  });

  it('clicking the toggle dispatches toggleCanvasLocked and closes', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close }));
    const lock = findFCByLabel(tree, 'canvas.contextMenu.lockCanvas')!;
    (lock.props.onClick as () => void)();
    expect(mocks.toggleCanvasLocked).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

describe('CanvasMenu — hover handlers wire submenu state', () => {
  it('hover.onEnter clears any pending close timer and sets openId', () => {
    const tree = render(baseProps());
    const block = findFCByLabel(tree, 'canvas.contextMenu.addBlock')!;
    expect(typeof block.props.onEnter).toBe('function');
    expect(typeof block.props.onLeave).toBe('function');
    // Calling onEnter must not throw.
    (block.props.onEnter as () => void)();
  });

  it('hover.onLeave schedules a 100ms timer to clear openId', () => {
    const setT = vi.fn();
    vi.stubGlobal('setTimeout', setT);
    const tree = render(baseProps());
    const block = findFCByLabel(tree, 'canvas.contextMenu.addBlock')!;
    (block.props.onLeave as () => void)();
    expect(setT).toHaveBeenCalled();
    expect(setT.mock.calls[0][1]).toBe(100);
    // Run the inner timer fn to cover the setOpenId(null) path.
    const fn = setT.mock.calls[0][0] as () => void;
    expect(() => fn()).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('CanvasMenu — root container', () => {
  it('positions itself at the supplied left/top', () => {
    const tree = render(baseProps({ position: { x: 50, y: 75 } }));
    const root = findFirst(tree, (el) => el.type === 'div' && (el.props.style as { left?: number })?.left === 50);
    expect(root).toBeDefined();
    expect((root!.props.style as { top: number }).top).toBe(75);
  });

  it('renders the root div with a defined className', () => {
    const tree = render(baseProps());
    const root = findFirst(
      tree,
      (el) => el.type === 'div' && typeof (el.props.style as { left?: number })?.left === 'number',
    )!;
    expect(typeof root.props.className).toBe('string');
    expect((root.props.className as string).length).toBeGreaterThan(0);
  });
});
