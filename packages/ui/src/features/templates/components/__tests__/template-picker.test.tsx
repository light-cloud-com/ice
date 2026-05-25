/**
 * TemplatePicker — searchable dropdown that imports a template into a card.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => ({
    type: 'div',
    props: { ...rest, children },
  });
  const allTemplates = [
    {
      id: 't-1',
      name: 'Tmpl1',
      description: 'd1',
      category: 'web',
      icon: 'Globe',
      estimatedCost: '$10/mo',
      blocks: ['a'],
      tags: ['react'],
    },
    {
      id: 't-2',
      name: 'Tmpl2',
      description: 'd2',
      category: 'web',
      icon: 'NotInMap',
      estimatedCost: '$20/mo',
      blocks: ['a', 'b'],
      tags: ['vue'],
    },
    {
      id: 't-3',
      name: 'Tmpl3',
      description: 'd3',
      category: 'backend',
      icon: 'Server',
      estimatedCost: '$30/mo',
      blocks: [],
      tags: [],
    },
  ];
  return {
    Pass,
    allTemplates,
    categories: [
      { id: 'web', icon: 'Globe', color: '#f00', label: 'Web' },
      { id: 'backend', icon: 'NotInMap', color: '#0f0', label: 'Backend' },
    ],
    state: { ui: { splitView: { activePaneId: 'pane-1' } } },
    dispatch: vi.fn(),
    searchSpy: vi.fn(),
    expandSpy: vi.fn((..._args: unknown[]) => ({ nodes: [{ id: 'n1' }], edges: [] })),
    createCardSpy: vi.fn((arg: unknown) => ({ type: 'cards/create', payload: arg })),
    importToActiveCardSpy: vi.fn((arg: unknown) => ({ type: 'cards/import', payload: arg })),
    openTabInPaneSpy: vi.fn((arg: unknown) => ({ type: 'ui/openTab', payload: arg })),
    setActivePaneSpy: vi.fn((arg: unknown) => ({ type: 'ui/setActive', payload: arg })),
    apiSpy: vi.fn(),
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => [init, vi.fn()]);
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, useMemo, default: { ...def, useState, useMemo } };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
  useDispatch: () => mocks.dispatch,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` }),
}));

vi.mock('../../../../config/templates', () => ({
  ALL_TEMPLATES: mocks.allTemplates,
  TEMPLATE_CATEGORIES: mocks.categories,
  searchTemplates: (q: string, all: unknown) => mocks.searchSpy(q, all) ?? mocks.allTemplates,
  expandComposedTemplate: (t: unknown) => mocks.expandSpy(t),
}));

vi.mock('../../../../shared/components/ui/badge', () => ({ Badge: mocks.Pass }));
vi.mock('../../../../shared/components/ui/dropdown-menu', () => ({
  DropdownMenu: mocks.Pass,
  DropdownMenuTrigger: mocks.Pass,
  DropdownMenuContent: mocks.Pass,
  DropdownMenuLabel: mocks.Pass,
  DropdownMenuSeparator: mocks.Pass,
  DropdownMenuGroup: mocks.Pass,
}));
vi.mock('../../../../shared/components/ui/search-input', () => ({ SearchInput: mocks.Pass }));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  createCard: (arg: unknown) => mocks.createCardSpy(arg),
  importToActiveCard: (arg: unknown) => mocks.importToActiveCardSpy(arg),
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  openTabInPane: (arg: unknown) => mocks.openTabInPaneSpy(arg),
  setActivePane: (arg: unknown) => mocks.setActivePaneSpy(arg),
}));

vi.mock('../../../../shared/api/api-adapter', () => ({
  getApi: () => ({
    templates: {
      loadToGraph: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

import { TemplatePicker } from '../template-picker';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}
function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}
function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}
function collectText(node: unknown): string {
  let s = '';
  for (const el of walk(node)) {
    const c = (el.props as { children?: unknown }).children;
    if (typeof c === 'string') s += c + ' ';
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item + ' ';
      }
    }
  }
  return s;
}

const callRender = (): unknown => (TemplatePicker as () => unknown)();

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.searchSpy.mockReset();
  mocks.searchSpy.mockReturnValue(mocks.allTemplates);
  mocks.expandSpy.mockReset();
  mocks.expandSpy.mockReturnValue({ nodes: [{ id: 'n1' }], edges: [] });
  mocks.createCardSpy.mockClear();
  mocks.importToActiveCardSpy.mockClear();
  mocks.openTabInPaneSpy.mockClear();
  mocks.setActivePaneSpy.mockClear();
});

describe('TemplatePicker — render', () => {
  it('renders the trigger button', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders the empty state when grouped is empty', () => {
    mocks.searchSpy.mockReturnValue([]);
    const tree = callRender();
    expect(collectText(tree)).toContain('t:templates.noResults');
  });

  it('renders a group section per non-empty category', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('Web');
    expect(text).toContain('Backend');
  });

  it('renders each template as a button', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // 1 trigger + 3 templates = 4
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders the cost + blocks count + tags', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('$10/mo');
    expect(text).toContain('react');
  });
});

describe('TemplatePicker — handleSelect', () => {
  it('clicking a template dispatches createCard + openTabInPane + importToActiveCard', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // First template = buttons[1] (after trigger)
    (buttons[1].props.onClick as () => void)?.();
    expect(mocks.createCardSpy).toHaveBeenCalled();
    expect(mocks.openTabInPaneSpy).toHaveBeenCalledWith({ paneId: 'pane-1', cardId: expect.stringContaining('card-') });
    expect(mocks.setActivePaneSpy).toHaveBeenCalledWith('pane-1');
    expect(mocks.importToActiveCardSpy).toHaveBeenCalled();
    expect(mocks.expandSpy).toHaveBeenCalled();
  });
});
