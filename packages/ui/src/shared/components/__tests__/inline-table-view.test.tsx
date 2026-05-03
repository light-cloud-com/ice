/**
 * inline-table-view tests — direct-FC tree-walker.
 *
 * The orchestrator owns 9 useState slots (search, sortCol, sortDir,
 * statusFilter, providerFilter, groupBy, density, expanded). It also
 * delegates row materialization to `useTableRows` and renders four
 * sub-components (Toolbar, ColumnHeader, TableBody, TableFooter).
 *
 * Sub-components are mocked as opaque markers; we verify orchestrator
 * wiring by reading the props passed to each marker and exercising the
 * callbacks they receive.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    selection: { selectedNodes: [] as string[] },
    ui: { showProperties: false },
    deploy: { deployedResources: [] as unknown[], driftByNode: {} as Record<string, unknown> },
    pipeline: { nodeStatus: {} as Record<string, unknown> },
    cards: { activeCardId: 'c1', cards: [{ id: 'c1', nodes: [] as Array<{ id: string }> }] },
  },
  // useState slot overrides + setter capture
  useStateOverrides: {} as Record<number, unknown>,
  useStateSetters: [] as Array<ReturnType<typeof vi.fn>>,
  useStateCount: 0,
  effects: [] as Array<() => void | (() => void)>,
  callbacks: [] as unknown[],
  dispatch: vi.fn(),
  navigate: vi.fn(),
  pathname: '/projects/p1/canvas/table',
  // Sub-components — markers.
  Toolbar: vi.fn(() => null),
  ColumnHeader: vi.fn(() => null),
  TableBody: vi.fn(() => null),
  TableFooter: vi.fn(() => null),
  // useTableRows mock.
  useTableRows: vi.fn(() => ({
    rows: [{ node: { id: 'n1' }, label: 'A' }],
    sorted: [{ node: { id: 'n1' }, label: 'A' }],
    grouped: [],
    counts: { live: 1 },
    availableProviders: ['gcp'],
  })),
  // Action creators.
  setSelectedNodes: vi.fn((p: unknown) => ({ type: 'selection/setSelectedNodes', payload: p })),
  toggleProperties: vi.fn(() => ({ type: 'ui/toggleProperties' })),
  deleteCardNode: vi.fn((p: unknown) => ({ type: 'cards/deleteNode', payload: p })),
}));

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useStateStub = <T,>(init: T | (() => T)): [T, (v: T) => void] => {
    const idx = mocks.useStateCount;
    mocks.useStateCount += 1;
    const initVal = typeof init === 'function' ? (init as () => T)() : init;
    const override = mocks.useStateOverrides[idx];
    const value = override !== undefined ? (override as T) : initVal;
    const setter = vi.fn();
    mocks.useStateSetters[idx] = setter;
    return [value, setter];
  };
  const useEffectStub = (fn: () => void | (() => void)) => {
    mocks.effects.push(fn);
  };
  const useCallbackStub = <T,>(fn: T) => {
    mocks.callbacks.push(fn);
    return fn;
  };
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    default: { ...actualDefault, useState: useStateStub, useEffect: useEffectStub, useCallback: useCallbackStub },
    useState: useStateStub,
    useEffect: useEffectStub,
    useCallback: useCallbackStub,
  };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock('../inline-table-view/column-header', () => ({ ColumnHeader: mocks.ColumnHeader }));
vi.mock('../inline-table-view/table-body', () => ({ TableBody: mocks.TableBody }));
vi.mock('../inline-table-view/table-footer', () => ({ TableFooter: mocks.TableFooter }));
vi.mock('../inline-table-view/toolbar', () => ({ Toolbar: mocks.Toolbar }));

vi.mock('../inline-table-view/use-table-rows', () => ({
  useTableRows: mocks.useTableRows,
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../store/slices/cards-slice', () => ({
  selectActiveCard: (s: typeof mocks.state) =>
    s.cards.cards.find((c) => c.id === s.cards.activeCardId) || undefined,
  deleteCardNode: mocks.deleteCardNode,
}));

vi.mock('../../../store/slices/selection-slice', () => ({
  setSelectedNodes: mocks.setSelectedNodes,
}));

vi.mock('../../../store/slices/ui-slice', () => ({
  toggleProperties: mocks.toggleProperties,
}));

import { InlineTableView } from '../inline-table-view';

// ─── Tree walker ────────────────────────────────────────────────────────────

interface ElLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isEl(x: unknown): x is ElLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
const KNOWN_MOCKS = [mocks.Toolbar, mocks.ColumnHeader, mocks.TableBody, mocks.TableFooter];
function* walk(node: unknown): Generator<ElLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isEl(node)) return;
  yield node;
  if (KNOWN_MOCKS.includes(node.type as ReturnType<typeof vi.fn>)) {
    yield* walk(node.props.children);
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

const callRender = (): unknown =>
  (InlineTableView as unknown as (p: unknown) => unknown)({});

beforeEach(() => {
  mocks.state.selection.selectedNodes = [];
  mocks.state.ui.showProperties = false;
  mocks.state.deploy.deployedResources = [];
  mocks.state.deploy.driftByNode = {};
  mocks.state.pipeline.nodeStatus = {};
  mocks.state.cards = { activeCardId: 'c1', cards: [{ id: 'c1', nodes: [] }] };
  mocks.useStateOverrides = {};
  mocks.useStateSetters = [];
  mocks.useStateCount = 0;
  mocks.effects = [];
  mocks.callbacks = [];
  mocks.pathname = '/projects/p1/canvas/table';
  mocks.dispatch.mockClear();
  mocks.navigate.mockClear();
  mocks.setSelectedNodes.mockClear();
  mocks.toggleProperties.mockClear();
  mocks.deleteCardNode.mockClear();
  mocks.Toolbar.mockClear();
  mocks.ColumnHeader.mockClear();
  mocks.TableBody.mockClear();
  mocks.TableFooter.mockClear();
  mocks.useTableRows.mockClear();
  mocks.useTableRows.mockReturnValue({
    rows: [{ node: { id: 'n1' }, label: 'A' }],
    sorted: [{ node: { id: 'n1' }, label: 'A' }],
    grouped: [],
    counts: { live: 1 },
    availableProviders: ['gcp'],
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InlineTableView — base layout', () => {
  it('renders Toolbar / ColumnHeader / TableBody / TableFooter', () => {
    const tree = callRender();
    expect(findFirst(tree, (el) => el.type === mocks.Toolbar)).toBeDefined();
    expect(findFirst(tree, (el) => el.type === mocks.ColumnHeader)).toBeDefined();
    expect(findFirst(tree, (el) => el.type === mocks.TableBody)).toBeDefined();
    expect(findFirst(tree, (el) => el.type === mocks.TableFooter)).toBeDefined();
  });
});

describe('InlineTableView — Toolbar wiring', () => {
  it('Toolbar receives initial state defaults', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    const props = toolbar.props as {
      search: string;
      groupBy: string;
      density: string;
      hasActiveFilter: boolean;
      counts: object;
      availableProviders: unknown[];
    };
    expect(props.search).toBe('');
    expect(props.groupBy).toBe('none');
    expect(props.density).toBe('comfortable');
    expect(props.hasActiveFilter).toBe(false);
  });

  it('Toolbar.onSearchChange forwards to setSearch (state slot 0)', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onSearchChange: (v: string) => void }).onSearchChange('foo');
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('foo');
  });

  it('Toolbar.onClearFilters resets search/status/provider filters', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onClearFilters: () => void }).onClearFilters();
    // setSearch (slot 0), setStatusFilter (slot 3), setProviderFilter (slot 4)
    expect(mocks.useStateSetters[0]).toHaveBeenCalledWith('');
    expect(mocks.useStateSetters[3]).toHaveBeenCalled();
    expect(mocks.useStateSetters[4]).toHaveBeenCalled();
  });

  it('hasActiveFilter is true when search has non-empty length', () => {
    mocks.useStateOverrides = { 0: 'query' };
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    expect((toolbar.props as { hasActiveFilter: boolean }).hasActiveFilter).toBe(true);
  });

  it('hasActiveFilter is true when statusFilter has entries', () => {
    mocks.useStateOverrides = { 3: new Set(['live']) };
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    expect((toolbar.props as { hasActiveFilter: boolean }).hasActiveFilter).toBe(true);
  });

  it('hasActiveFilter is true when providerFilter has entries', () => {
    mocks.useStateOverrides = { 4: new Set(['gcp']) };
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    expect((toolbar.props as { hasActiveFilter: boolean }).hasActiveFilter).toBe(true);
  });

  it('Toolbar.onToggleStatus adds the status when missing', () => {
    mocks.useStateOverrides = { 3: new Set<string>() };
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onToggleStatus: (s: string) => void }).onToggleStatus('live');
    // setStatusFilter is slot 3 — its setter receives a updater function.
    const updater = mocks.useStateSetters[3].mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const next = updater(new Set<string>());
    expect(next.has('live')).toBe(true);
  });

  it('Toolbar.onToggleStatus removes the status when present', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onToggleStatus: (s: string) => void }).onToggleStatus('failed');
    const updater = mocks.useStateSetters[3].mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const next = updater(new Set(['failed']));
    expect(next.has('failed')).toBe(false);
  });

  it('Toolbar.onToggleProvider adds the provider when missing', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onToggleProvider: (p: string) => void }).onToggleProvider('aws');
    const updater = mocks.useStateSetters[4].mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const next = updater(new Set<string>());
    expect(next.has('aws')).toBe(true);
  });

  it('Toolbar.onToggleProvider removes the provider when present', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onToggleProvider: (p: string) => void }).onToggleProvider('aws');
    const updater = mocks.useStateSetters[4].mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const next = updater(new Set(['aws']));
    expect(next.has('aws')).toBe(false);
  });

  it('Toolbar.onGroupByChange and onDensityChange route to slots 5 and 6', () => {
    const tree = callRender();
    const toolbar = findFirst(tree, (el) => el.type === mocks.Toolbar)!;
    (toolbar.props as { onGroupByChange: (v: string) => void }).onGroupByChange('status');
    expect(mocks.useStateSetters[5]).toHaveBeenCalledWith('status');
    (toolbar.props as { onDensityChange: (v: string) => void }).onDensityChange('compact');
    expect(mocks.useStateSetters[6]).toHaveBeenCalledWith('compact');
  });
});

describe('InlineTableView — ColumnHeader sort wiring', () => {
  it('toggleSort flips direction when col matches sortCol', () => {
    mocks.useStateOverrides = { 1: 'label', 2: 'asc' };
    const tree = callRender();
    const col = findFirst(tree, (el) => el.type === mocks.ColumnHeader)!;
    (col.props as { onToggleSort: (c: string) => void }).onToggleSort('label');
    // sortDir setter (slot 2) receives an updater fn.
    const updater = mocks.useStateSetters[2].mock.calls[0][0] as (d: string) => string;
    expect(updater('asc')).toBe('desc');
    expect(updater('desc')).toBe('asc');
  });

  it('toggleSort sets new col to asc when col differs from sortCol', () => {
    mocks.useStateOverrides = { 1: 'label', 2: 'desc' };
    const tree = callRender();
    const col = findFirst(tree, (el) => el.type === mocks.ColumnHeader)!;
    (col.props as { onToggleSort: (c: string) => void }).onToggleSort('provider');
    expect(mocks.useStateSetters[1]).toHaveBeenCalledWith('provider');
    expect(mocks.useStateSetters[2]).toHaveBeenCalledWith('asc');
  });

  it('forwards sortCol and sortDir to ColumnHeader', () => {
    mocks.useStateOverrides = { 1: 'status', 2: 'desc' };
    const tree = callRender();
    const col = findFirst(tree, (el) => el.type === mocks.ColumnHeader)!;
    expect((col.props as { sortCol: string }).sortCol).toBe('status');
    expect((col.props as { sortDir: string }).sortDir).toBe('desc');
  });
});

describe('InlineTableView — TableBody wiring', () => {
  it('forwards sorted/rows/grouped/density/groupBy', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    const props = body.props as {
      sorted: unknown[];
      rows: unknown[];
      grouped: unknown[];
      density: string;
      groupBy: string;
    };
    expect(props.sorted.length).toBe(1);
    expect(props.density).toBe('comfortable');
    expect(props.groupBy).toBe('none');
  });

  it('onSelectRow with a regular click replaces the selection', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    const onSelect = (body.props as {
      onSelectRow: (id: string, e: React.MouseEvent) => void;
    }).onSelectRow;
    onSelect('n1', { metaKey: false, ctrlKey: false } as React.MouseEvent);
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['n1']);
    // showProperties=false so toggleProperties is dispatched.
    expect(mocks.toggleProperties).toHaveBeenCalled();
  });

  it('onSelectRow with metaKey/ctrlKey adds the id when not selected', () => {
    mocks.state.selection.selectedNodes = [];
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    const onSelect = (body.props as {
      onSelectRow: (id: string, e: React.MouseEvent) => void;
    }).onSelectRow;
    onSelect('n1', { metaKey: true } as React.MouseEvent);
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['n1']);
  });

  it('onSelectRow with metaKey removes the id when already selected', () => {
    mocks.state.selection.selectedNodes = ['n1', 'n2'];
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    const onSelect = (body.props as {
      onSelectRow: (id: string, e: React.MouseEvent) => void;
    }).onSelectRow;
    onSelect('n1', { ctrlKey: true } as React.MouseEvent);
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['n2']);
  });

  it('onSelectRow does not toggle properties when already shown', () => {
    mocks.state.ui.showProperties = true;
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onSelectRow: (id: string, e: React.MouseEvent) => void }).onSelectRow(
      'n1',
      { metaKey: false } as React.MouseEvent,
    );
    expect(mocks.toggleProperties).not.toHaveBeenCalled();
  });

  it('onCopyId writes the providerId via clipboard', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onCopyId: (row: { providerId?: string; node: { id: string } }) => void }).onCopyId(
      { providerId: 'svc-1', node: { id: 'fallback' } },
    );
    expect(writeText).toHaveBeenCalledWith('svc-1');
    vi.unstubAllGlobals();
  });

  it('onCopyId falls back to the node id when providerId is empty', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onCopyId: (row: { providerId?: string; node: { id: string } }) => void }).onCopyId(
      { providerId: '', node: { id: 'fallback' } },
    );
    expect(writeText).toHaveBeenCalledWith('fallback');
    vi.unstubAllGlobals();
  });

  it('onCopyName writes the row label via clipboard', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onCopyName: (row: { label: string }) => void }).onCopyName({ label: 'My Service' });
    expect(writeText).toHaveBeenCalledWith('My Service');
    vi.unstubAllGlobals();
  });

  it('onRevealOnCanvas selects the node and navigates to the canvas path', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onRevealOnCanvas: (id: string) => void }).onRevealOnCanvas('n1');
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['n1']);
    expect(mocks.navigate).toHaveBeenCalledWith('/projects/p1/canvas');
  });

  it('onRevealOnCanvas keeps the path unchanged when not under /table', () => {
    mocks.pathname = '/some/other/path';
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onRevealOnCanvas: (id: string) => void }).onRevealOnCanvas('n2');
    expect(mocks.navigate).toHaveBeenCalledWith('/some/other/path');
  });

  it('onOpenProperties selects the node and opens properties panel when hidden', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onOpenProperties: (id: string) => void }).onOpenProperties('n1');
    expect(mocks.setSelectedNodes).toHaveBeenCalledWith(['n1']);
    expect(mocks.toggleProperties).toHaveBeenCalled();
  });

  it('onOpenProperties does not toggle properties when already shown', () => {
    mocks.state.ui.showProperties = true;
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onOpenProperties: (id: string) => void }).onOpenProperties('n1');
    expect(mocks.toggleProperties).not.toHaveBeenCalled();
  });

  it('onDeleteRow dispatches deleteCardNode for the supplied id', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onDeleteRow: (id: string) => void }).onDeleteRow('n1');
    expect(mocks.deleteCardNode).toHaveBeenCalledWith('n1');
  });

  it('onToggleExpand adds id when missing and removes when present', () => {
    const tree = callRender();
    const body = findFirst(tree, (el) => el.type === mocks.TableBody)!;
    (body.props as { onToggleExpand: (id: string) => void }).onToggleExpand('n1');
    // expanded is slot 7.
    const updater = mocks.useStateSetters[7].mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>;
    expect(updater(new Set()).has('n1')).toBe(true);
    expect(updater(new Set(['n1'])).has('n1')).toBe(false);
  });
});

describe('InlineTableView — TableFooter wiring', () => {
  it('forwards sortedCount/totalCount/selectedCount/counts/statusFilter', () => {
    mocks.state.selection.selectedNodes = ['x', 'y'];
    const tree = callRender();
    const footer = findFirst(tree, (el) => el.type === mocks.TableFooter)!;
    const props = footer.props as {
      sortedCount: number;
      totalCount: number;
      selectedCount: number;
    };
    expect(props.sortedCount).toBe(1);
    expect(props.totalCount).toBe(1);
    expect(props.selectedCount).toBe(2);
  });

  it('TableFooter.onToggleStatus shares the same updater path as Toolbar', () => {
    const tree = callRender();
    const footer = findFirst(tree, (el) => el.type === mocks.TableFooter)!;
    (footer.props as { onToggleStatus: (s: string) => void }).onToggleStatus('live');
    expect(mocks.useStateSetters[3]).toHaveBeenCalled();
  });
});

describe('InlineTableView — expanded-rows cleanup effect', () => {
  it('strips expanded ids that no longer exist in the active card', () => {
    mocks.state.cards = {
      activeCardId: 'c1',
      cards: [{ id: 'c1', nodes: [{ id: 'a' }, { id: 'b' }] }],
    };
    callRender();
    // Drive the useEffect (only one) — passes "stale" prev set.
    for (const fx of mocks.effects) fx();
    // setExpanded (slot 7) called with an updater fn.
    const setter = mocks.useStateSetters[7];
    expect(setter).toHaveBeenCalled();
    const updater = setter.mock.calls[setter.mock.calls.length - 1][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const next = updater(new Set(['a', 'gone']));
    expect(next.has('a')).toBe(true);
    expect(next.has('gone')).toBe(false);
  });

  it('returns the previous set unchanged when no expanded ids dropped', () => {
    mocks.state.cards = {
      activeCardId: 'c1',
      cards: [{ id: 'c1', nodes: [{ id: 'a' }] }],
    };
    callRender();
    for (const fx of mocks.effects) fx();
    const setter = mocks.useStateSetters[7];
    const updater = setter.mock.calls[setter.mock.calls.length - 1][0] as (
      prev: Set<string>,
    ) => Set<string>;
    const prev = new Set(['a']);
    const next = updater(prev);
    expect(next).toBe(prev);
  });

  it('handles missing activeCard.nodes gracefully (treats as empty list)', () => {
    mocks.state.cards = { activeCardId: 'c1', cards: [{ id: 'c1', nodes: undefined as unknown as Array<{ id: string }> }] };
    callRender();
    for (const fx of mocks.effects) fx();
    const setter = mocks.useStateSetters[7];
    expect(setter).toHaveBeenCalled();
  });

  it('handles activeCard being undefined', () => {
    mocks.state.cards = { activeCardId: 'absent', cards: [] };
    callRender();
    for (const fx of mocks.effects) fx();
    const setter = mocks.useStateSetters[7];
    expect(setter).toHaveBeenCalled();
  });
});

describe('InlineTableView — useTableRows input', () => {
  it('passes the active card and filters to useTableRows', () => {
    mocks.useStateOverrides = { 0: 'srch', 5: 'status', 1: 'updatedAt', 2: 'desc' };
    callRender();
    const args = mocks.useTableRows.mock.calls[0][0] as {
      search: string;
      groupBy: string;
      sortCol: string;
      sortDir: string;
    };
    expect(args.search).toBe('srch');
    expect(args.groupBy).toBe('status');
    expect(args.sortCol).toBe('updatedAt');
    expect(args.sortDir).toBe('desc');
  });
});
