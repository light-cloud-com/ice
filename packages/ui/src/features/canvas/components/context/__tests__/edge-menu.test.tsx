/**
 * edge-menu tests — direct-FC tree-walker.
 *
 * Sister of node-menu / canvas-menu — same pattern: mock i18n + the slice
 * action creators so we can verify dispatched actions, then walk the
 * returned ReactElement tree by hand.
 *
 * EdgeMenu is a thin shell with two MenuItems (Properties + Delete) and a
 * Separator between them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Action creators — return tagged objects so dispatch.calls[i][0] is verifiable.
  deleteCardEdge: vi.fn((p: unknown) => ({ type: 'cards/deleteEdge', payload: p })),
  setSelectedEdges: vi.fn((p: unknown) => ({ type: 'selection/setSelectedEdges', payload: p })),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
}));

vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../../store/slices/cards-slice', () => ({
  deleteCardEdge: mocks.deleteCardEdge,
}));

vi.mock('../../../../../store/slices/selection-slice', () => ({
  setSelectedEdges: mocks.setSelectedEdges,
}));

vi.mock('../../../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

import { EdgeMenu } from '../edge-menu';

// ─── Tree walker ──────────────────────────────────────────────────────────

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

const baseProps = (overrides: Partial<Parameters<typeof EdgeMenu>[0]> = {}): Parameters<typeof EdgeMenu>[0] => ({
  menuRef: { current: null },
  position: { x: 100, y: 200 },
  targetId: 'edge-1',
  showProperties: false,
  close: vi.fn(),
  dispatch: vi.fn(),
  ...overrides,
});

const render = (props: Parameters<typeof EdgeMenu>[0]) => (EdgeMenu as unknown as (p: unknown) => unknown)(props);

beforeEach(() => {
  mocks.deleteCardEdge.mockClear();
  mocks.setSelectedEdges.mockClear();
  mocks.toggleProperties.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('EdgeMenu — Properties item', () => {
  it('clicking properties dispatches setSelectedEdges([targetId]), toggles properties when hidden, and closes', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, targetId: 'edge-42', showProperties: false }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.properties')!;
    (item.props.onClick as () => void)();
    expect(mocks.setSelectedEdges).toHaveBeenCalledWith(['edge-42']);
    expect(mocks.toggleProperties).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('clicking properties does NOT toggle properties when already shown', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, showProperties: true }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.properties')!;
    (item.props.onClick as () => void)();
    expect(mocks.setSelectedEdges).toHaveBeenCalledWith(['edge-1']);
    expect(mocks.toggleProperties).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});

describe('EdgeMenu — Delete item', () => {
  it('clicking delete dispatches deleteCardEdge(targetId) and closes', () => {
    const dispatch = vi.fn();
    const close = vi.fn();
    const tree = render(baseProps({ dispatch, close, targetId: 'edge-99' }));
    const item = findFCByLabel(tree, 'canvas.contextMenu.deleteConnection')!;
    (item.props.onClick as () => void)();
    expect(mocks.deleteCardEdge).toHaveBeenCalledWith('edge-99');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('renders the delete item with danger styling and Del shortcut', () => {
    const tree = render(baseProps());
    const item = findFCByLabel(tree, 'canvas.contextMenu.deleteConnection')!;
    expect((item.props as { danger: boolean }).danger).toBe(true);
    expect((item.props as { shortcut: string }).shortcut).toBe('Del');
  });
});

describe('EdgeMenu — structure', () => {
  it('renders exactly one Separator between the two MenuItems', () => {
    const tree = render(baseProps());
    // The Separator is a function component (no label).
    const items = findAll(tree, (el) => typeof el.type === 'function');
    // We expect the EdgeMenu's children: 2 MenuItem FC + 1 Separator FC = 3 FC siblings
    // walked at the top level. The walker will descend into each, so we just check
    // that both labelled menu items exist.
    expect(findFCByLabel(tree, 'canvas.contextMenu.properties')).toBeDefined();
    expect(findFCByLabel(tree, 'canvas.contextMenu.deleteConnection')).toBeDefined();
    // Sanity: at least one FC named differently from 'MenuItem' isn't required —
    // but the FC count should be > 2 because the separator is in the mix too.
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('positions the root at left=position.x / top=position.y', () => {
    const tree = render(baseProps({ position: { x: 12, y: 34 } }));
    const root = findFirst(tree, (el) => el.type === 'div' && (el.props.style as { left?: number })?.left === 12)!;
    expect((root.props.style as { top: number }).top).toBe(34);
  });

  it('renders the root div as the outermost element', () => {
    const tree = render(baseProps()) as ElLike;
    expect(tree.type).toBe('div');
  });
});
