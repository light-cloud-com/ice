/**
 * node-menu tests — direct-FC tree-walker.
 *
 * Covers the per-node context menu — Properties / Copy / Cut / Duplicate /
 * Delete and the Container-only fold and Auto-organize submenu.
 *
 * Mocks i18n + slice action creators; React hooks via passthrough.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  useStateOverrides: {} as Record<number, unknown>,
  useStateCount: 0,
  refs: [] as Array<{ current: unknown }>,
  // Action creators
  deleteCardNode: vi.fn((p: unknown) => ({ type: 'cards/deleteNode', payload: p })),
  toggleCardNodeFold: vi.fn((p: unknown) => ({ type: 'cards/toggleFold', payload: p })),
  autoOrganizeCard: vi.fn((p: unknown) => ({ type: 'cards/autoOrganize', payload: p })),
  updateCardNodeData: vi.fn((p: unknown) => ({ type: 'cards/updateNodeData', payload: p })),
  groupSelectedNodes: vi.fn((p: unknown) => ({ type: 'cards/groupSelected', payload: p })),
  setSelectedNodes: vi.fn((p: unknown) => ({ type: 'selection/setSelectedNodes', payload: p })),
  clearSelection: vi.fn(() => ({ type: 'selection/clearSelection' })),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
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
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) =>
      vars && Object.keys(vars).length > 0 ? `${k}:${JSON.stringify(vars)}` : k,
  }),
}));

vi.mock('../../../../../store/slices/cards-slice', () => ({
  deleteCardNode: mocks.deleteCardNode,
  toggleCardNodeFold: mocks.toggleCardNodeFold,
  autoOrganizeCard: mocks.autoOrganizeCard,
  updateCardNodeData: mocks.updateCardNodeData,
  groupSelectedNodes: mocks.groupSelectedNodes,
}));

vi.mock('../../../../../store/slices/selection-slice', () => ({
  setSelectedNodes: mocks.setSelectedNodes,
  clearSelection: mocks.clearSelection,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

// NodeMenu reads `ENABLED_PROVIDERS` + `getCategoryForIceType` +
// `isCategoryEnabledForProvider` from `@ice/constants`. The test pins the
// submenu surface to {aws, gcp} so it stays stable across live PROVIDER_FLAGS
// changes — stub `ENABLED_PROVIDERS` to that fixture and stub the per-category
// gate to true so all providers in the fixture survive the filter.
vi.mock('@ice/constants', () => ({
  CLOUD_PROVIDERS: [
    { id: 'aws', name: 'AWS', shortName: 'AWS', description: '', icon: 'aws', color: '#fff' },
    { id: 'gcp', name: 'GCP', shortName: 'GCP', description: '', icon: 'gcp', color: '#fff' },
  ],
  ENABLED_PROVIDERS: [
    { id: 'aws', name: 'AWS', shortName: 'AWS', description: '', icon: 'aws', color: '#fff' },
    { id: 'gcp', name: 'GCP', shortName: 'GCP', description: '', icon: 'gcp', color: '#fff' },
  ],
  getCategoryForIceType: () => undefined,
  isCategoryEnabledForProvider: () => true,
}));

import { fireKey } from '../menu-primitives';
import { NodeMenu } from '../node-menu';

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

const findFCByLabel = (tree: unknown, label: string): ElLike | undefined =>
  findFirst(tree, (el) => typeof el.type === 'function' && (el.props as { label?: unknown }).label === label);

// SubMenu items become buttons with string children inside the popover.
const findSubItem = (tree: unknown, label: string): ElLike | undefined =>
  findFirst(tree, (el) => el.type === 'button' && el.props.children === label);

const baseProps = (overrides: Partial<Parameters<typeof NodeMenu>[0]> = {}): Parameters<typeof NodeMenu>[0] => ({
  menuRef: { current: null },
  position: { x: 100, y: 200 },
  targetId: 'node-1',
  activeCard: {
    nodes: [
      {
        id: 'node-1',
        type: 'service',
        data: { label: 'My Service', iceType: 'Compute.Service', provider: 'gcp', estimatedCost: '$5/mo' },
      },
    ],
  },
  selectedNodes: [],
  showProperties: false,
  currentZoom: 1,
  close: vi.fn(),
  dispatch: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof NodeMenu>[0]) => (NodeMenu as unknown as (p: unknown) => unknown)(props);

beforeEach(() => {
  mocks.effects = [];
  mocks.useStateOverrides = {};
  mocks.useStateCount = 0;
  mocks.refs = [];
  mocks.deleteCardNode.mockClear();
  mocks.toggleCardNodeFold.mockClear();
  mocks.autoOrganizeCard.mockClear();
  mocks.updateCardNodeData.mockClear();
  mocks.groupSelectedNodes.mockClear();
  mocks.setSelectedNodes.mockClear();
  mocks.clearSelection.mockClear();
  mocks.toggleProperties.mockClear();
  (fireKey as ReturnType<typeof vi.fn>).mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NodeMenu — Properties item', () => {
  it('clicking properties dispatches setSelectedNodes([targetId]), toggles properties when hidden, closes', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, targetId: 'node-1', showProperties: false }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.properties')!;
    (item.props.onClick as () => void)();
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['node-1']);
    expect(mocks.toggleProperties).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('clicking properties does NOT toggle properties when already shown', () => {
    const dispatch = vi.fn();
    const tree = render(baseProps({ dispatch, showProperties: true }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.properties')!;
    (item.props.onClick as () => void)();
    expect(mocks.toggleProperties).not.toHaveBeenCalled();
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['node-1']);
  });
});

describe('NodeMenu — Copy / Cut / Duplicate keystrokes', () => {
  it('clicking copy fires Ctrl+C and closes', () => {
    const close = vi.fn();
    const tree = render(baseProps({ close }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.copy')!;
    (item.props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
    expect(fireKey).toHaveBeenCalledWith('c', true);
  });

  it('clicking cut fires Ctrl+X and closes', () => {
    const close = vi.fn();
    const tree = render(baseProps({ close }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.cut')!;
    (item.props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
    expect(fireKey).toHaveBeenCalledWith('x', true);
  });

  it('clicking duplicate fires Ctrl+C then schedules Ctrl+V via setTimeout(50)', () => {
    const setT = vi.fn();
    vi.stubGlobal('setTimeout', setT);
    const close = vi.fn();
    const tree = render(baseProps({ close }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.duplicate')!;
    (item.props.onClick as () => void)();
    expect(close).toHaveBeenCalled();
    expect(fireKey).toHaveBeenCalledWith('c', true);
    expect(setT).toHaveBeenCalled();
    expect(setT.mock.calls[0][1]).toBe(50);
    // Drive the inner timer fn — should fire 'v' true.
    (fireKey as ReturnType<typeof vi.fn>).mockClear();
    const fn = setT.mock.calls[0][0] as () => void;
    fn();
    expect(fireKey).toHaveBeenCalledWith('v', true);
    vi.unstubAllGlobals();
  });
});

describe('NodeMenu — Copy as text', () => {
  it('writes "iceType: label (PROVIDER, $cost)" to clipboard when all fields present', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const close = vi.fn();
    const tree = render(baseProps({ close }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.copyAsText')!;
    (item.props.onClick as () => void)();
    expect(writeText).toHaveBeenCalledWith('Compute.Service: My Service (GCP, $5/mo)');
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('falls back to targetId when label is missing', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = render(
      baseProps({
        activeCard: { nodes: [{ id: 'node-1', type: 'service', data: {} }] },
      }),
    );
    const item = findFCByLabel(tree, 'canvas.contextMenu.copyAsText')!;
    (item.props.onClick as () => void)();
    // No iceType prefix, no provider/cost suffix; label = targetId.
    expect(writeText).toHaveBeenCalledWith('node-1');
    vi.unstubAllGlobals();
  });

  it('omits cost from the copy when only provider is present', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = render(
      baseProps({
        activeCard: {
          nodes: [{ id: 'node-1', type: 'service', data: { label: 'X', provider: 'aws' } }],
        },
      }),
    );
    const item = findFCByLabel(tree, 'canvas.contextMenu.copyAsText')!;
    (item.props.onClick as () => void)();
    expect(writeText).toHaveBeenCalledWith('X (AWS)');
    vi.unstubAllGlobals();
  });

  it('omits provider from the copy when only cost is present', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = render(
      baseProps({
        activeCard: {
          nodes: [{ id: 'node-1', type: 'service', data: { label: 'X', estimatedCost: '$3' } }],
        },
      }),
    );
    const item = findFCByLabel(tree, 'canvas.contextMenu.copyAsText')!;
    (item.props.onClick as () => void)();
    expect(writeText).toHaveBeenCalledWith('X, $3)');
    vi.unstubAllGlobals();
  });
});

describe('NodeMenu — Change provider submenu', () => {
  it('renders a sub-item per cloud provider when openId=provider', () => {
    mocks.useStateOverrides = { 0: 'provider' };
    const tree = render(baseProps());
    const aws = findSubItem(tree, 'AWS');
    const gcp = findSubItem(tree, 'GCP');
    expect(aws).toBeDefined();
    expect(gcp).toBeDefined();
  });

  it('clicking a provider sub-item dispatches updateCardNodeData and closes', () => {
    mocks.useStateOverrides = { 0: 'provider' };
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, targetId: 'node-1' }));
    const aws = findSubItem(tree, 'AWS')!;
    (aws.props.onClick as () => void)();
    expect(mocks.updateCardNodeData).toHaveBeenCalledWith({ nodeId: 'node-1', data: { provider: 'aws' } });
    expect(close).toHaveBeenCalled();
  });
});

describe('NodeMenu — Container fold/unfold', () => {
  const containerProps = (folded = false) =>
    baseProps({
      activeCard: {
        nodes: [{ id: 'node-1', type: 'container', data: { label: 'Box', folded } }],
      },
    });

  it('renders the fold action when isContainer and not folded', () => {
    const tree = render(containerProps(false));
    expect(findFCByLabel(tree, 'canvas.contextMenu.fold')).toBeDefined();
  });

  it('renders the unfold action when isContainer and folded', () => {
    const tree = render(containerProps(true));
    expect(findFCByLabel(tree, 'canvas.contextMenu.unfold')).toBeDefined();
  });

  it('clicking fold/unfold dispatches toggleCardNodeFold and closes', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render({ ...containerProps(false), dispatch, close });
    const item = findFCByLabel(tree, 'canvas.contextMenu.fold')!;
    (item.props.onClick as () => void)();
    expect(mocks.toggleCardNodeFold).toHaveBeenCalledWith('node-1');
    expect(close).toHaveBeenCalled();
  });

  it('does not render the fold action when isContainer is false', () => {
    const tree = render(baseProps());
    expect(findFCByLabel(tree, 'canvas.contextMenu.fold')).toBeUndefined();
    expect(findFCByLabel(tree, 'canvas.contextMenu.unfold')).toBeUndefined();
  });

  it('container auto-organize submenu renders Vertical/Horizontal/Circular items', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const tree = render(containerProps(false));
    expect(findSubItem(tree, 'Vertical ↕')).toBeDefined();
    expect(findSubItem(tree, 'Horizontal ↔')).toBeDefined();
    expect(findSubItem(tree, 'Circular ◎')).toBeDefined();
  });

  it('container vertical layout dispatches autoOrganizeCard with direction+containerId+zoom', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render({ ...containerProps(false), dispatch, close, currentZoom: 0.75 });
    const item = findSubItem(tree, 'Vertical ↕')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      direction: 'vertical',
      containerId: 'node-1',
      zoom: 0.75,
    });
    expect(close).toHaveBeenCalled();
  });

  it('container horizontal layout dispatches autoOrganizeCard with direction=horizontal', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const tree = render({ ...containerProps(false), dispatch });
    const item = findSubItem(tree, 'Horizontal ↔')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      direction: 'horizontal',
      containerId: 'node-1',
      zoom: 1,
    });
  });

  it('container circular layout dispatches autoOrganizeCard with layout=circular', () => {
    mocks.useStateOverrides = { 0: 'organize' };
    const dispatch = vi.fn();
    const tree = render({ ...containerProps(false), dispatch });
    const item = findSubItem(tree, 'Circular ◎')!;
    (item.props.onClick as () => void)();
    expect(mocks.autoOrganizeCard).toHaveBeenCalledWith({
      layout: 'circular',
      containerId: 'node-1',
      zoom: 1,
    });
  });
});

describe('NodeMenu — Group selection', () => {
  it('renders the group action when more than one node is selected', () => {
    const tree = render(baseProps({ selectedNodes: ['a', 'b'] }));
    expect(findFCByLabel(tree, 'canvas.contextMenu.groupSelection')).toBeDefined();
  });

  it('does not render group action when only one (or zero) nodes are selected', () => {
    const tree = render(baseProps({ selectedNodes: ['only'] }));
    expect(findFCByLabel(tree, 'canvas.contextMenu.groupSelection')).toBeUndefined();
  });

  it('clicking the group action dispatches groupSelectedNodes(selectedNodes)', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, selectedNodes: ['a', 'b'] }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.groupSelection')!;
    (item.props.onClick as () => void)();
    expect(mocks.groupSelectedNodes).toHaveBeenCalledWith(['a', 'b']);
    expect(close).toHaveBeenCalled();
  });
});

describe('NodeMenu — Delete', () => {
  it('single-selection delete dispatches deleteCardNode(targetId) and clears selection', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, targetId: 'node-1' }));
    // The delete item label is i18n key 'delete' (single).
    const item = findFCByLabel(tree, 'canvas.contextMenu.delete')!;
    (item.props.onClick as () => void)();
    expect(mocks.deleteCardNode).toHaveBeenCalledWith('node-1');
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith([]);
    expect(mocks.clearSelection).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('multi-selection delete dispatches deleteCardNode for each selected and clearSelection', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, selectedNodes: ['a', 'b', 'c'] }));
    // The label includes the count via i18n vars.
    const item = findFirst(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { label?: unknown }).label === 'string' &&
        ((el.props as { label: string }).label as string).startsWith('canvas.contextMenu.deleteItems'),
    )!;
    expect((item.props as { label: string }).label).toContain('"count":3');
    (item.props.onClick as () => void)();
    expect(mocks.deleteCardNode).toHaveBeenCalledTimes(3);
    expect(mocks.deleteCardNode).toHaveBeenCalledWith('a');
    expect(mocks.deleteCardNode).toHaveBeenCalledWith('b');
    expect(mocks.deleteCardNode).toHaveBeenCalledWith('c');
    expect(mocks.clearSelection).toHaveBeenCalled();
    expect(mocks.setSelectedNodes).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('renders the delete item with danger styling and Del shortcut', () => {
    const tree = render(baseProps());
    const item = findFCByLabel(tree, 'canvas.contextMenu.delete')!;
    expect((item.props as { danger: boolean }).danger).toBe(true);
    expect((item.props as { shortcut: string }).shortcut).toBe('Del');
  });
});

describe('NodeMenu — Hover handlers', () => {
  it('hover.onLeave schedules a 100ms timer to clear openId', () => {
    const setT = vi.fn();
    vi.stubGlobal('setTimeout', setT);
    const tree = render(baseProps());
    const provider = findFCByLabel(tree, 'canvas.contextMenu.changeProvider')!;
    (provider.props.onLeave as () => void)();
    expect(setT).toHaveBeenCalled();
    expect(setT.mock.calls[0][1]).toBe(100);
    const fn = setT.mock.calls[0][0] as () => void;
    expect(() => fn()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('hover.onEnter does not throw', () => {
    const tree = render(baseProps());
    const provider = findFCByLabel(tree, 'canvas.contextMenu.changeProvider')!;
    expect(() => (provider.props.onEnter as () => void)()).not.toThrow();
  });
});

describe('NodeMenu — Defensive defaults for missing target', () => {
  it('survives when activeCard is undefined (targetNode is undefined)', () => {
    const tree = render(baseProps({ activeCard: undefined as unknown as object }));
    expect(findFCByLabel(tree, 'canvas.contextMenu.properties')).toBeDefined();
  });

  it('survives when targetNode is missing from the activeCard nodes list', () => {
    const tree = render(
      baseProps({ targetId: 'absent', activeCard: { nodes: [{ id: 'other', type: 'service', data: {} }] } }),
    );
    expect(findFCByLabel(tree, 'canvas.contextMenu.properties')).toBeDefined();
  });
});

describe('NodeMenu — root container', () => {
  it('positions the root at left=position.x / top=position.y', () => {
    const tree = render(baseProps({ position: { x: 12, y: 34 } }));
    const root = findFirst(tree, (el) => el.type === 'div' && (el.props.style as { left?: number })?.left === 12)!;
    expect((root.props.style as { top: number }).top).toBe(34);
  });
});
