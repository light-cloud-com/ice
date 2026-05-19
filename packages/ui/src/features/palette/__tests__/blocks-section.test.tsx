/**
 * rf-rpal-7 — BlocksSection.
 *
 * Layer 2 composing component. Renders the panel header (title, search,
 * provider dropdown) and the per-category collapsible groups of
 * `ComponentItem`s, plus the `DraggableGroupItem` affordance.
 *
 * Heavy mocks since the component pulls in:
 *   - `ComponentItem` and `DraggableGroupItem` — stubbed to opaque marker
 *     elements so per-call props can be inspected via the recorder.
 *   - `PanelHeader` — stubbed to render its `actions` slot inline so the
 *     provider dropdown remains in the tree.
 *   - `SelectPrimitive.*` — passthrough stubs (Root/Trigger/Portal/Content
 *     /Viewport/Item/ItemText/Icon) so the walker sees the dropdown items
 *     inline rather than via Radix's portal.
 *   - `getBrandIcon` — controllable mock returning either a brand
 *     descriptor or null.
 *   - `useTranslation` — identity `t(key) => key` for label assertions.
 *   - `cn` — space-joined truthy concat.
 *   - `PROVIDERS` — deterministic three-entry list.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  componentItemCalls: [] as Array<Record<string, unknown>>,
  draggableGroupCalls: [] as Array<Record<string, unknown>>,
  ComponentItemStub: vi.fn((props: Record<string, unknown>) => {
    mocks.componentItemCalls.push(props);
    return React.createElement('span', {
      'data-stub': 'ComponentItem',
      'data-component-type': (props.component as { type: string }).type,
      'data-stagger': props.staggerIndex,
    });
  }),
  DraggableGroupItemStub: vi.fn(() => {
    mocks.draggableGroupCalls.push({});
    return React.createElement('span', { 'data-stub': 'DraggableGroupItem' });
  }),
  brandIcon: null as { url: string } | null,
}));

vi.mock('../components/component-item', () => ({
  ComponentItem: mocks.ComponentItemStub,
}));

vi.mock('../components/draggable-group-item', () => ({
  DraggableGroupItem: mocks.DraggableGroupItemStub,
}));

vi.mock('../../../assets/icons/brand-registry', () => ({
  getBrandIcon: vi.fn(() => mocks.brandIcon),
}));

vi.mock('../../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../data/providers', () => ({
  PROVIDERS: [
    { id: 'all', label: 'palette.providerAll' },
    { id: 'aws', label: 'AWS', color: '#FF9900' },
    { id: 'gcp', label: 'GCP', color: '#4285F4' },
  ],
}));

// PanelHeader passthrough — render the actions slot inline so the
// dropdown items remain reachable to the walker.
vi.mock('../../../shared/components/ui/panel-header', () => ({
  PanelHeader: ({
    icon,
    title,
    search,
    actions,
  }: {
    icon: React.ReactNode;
    title: string;
    search?: { value: string; placeholder: string; id?: string; onChange?: (v: string) => void };
    actions?: React.ReactNode;
  }) =>
    React.createElement(
      'header',
      { 'data-stub': 'PanelHeader' },
      React.createElement('span', { 'data-slot': 'icon' }, icon),
      React.createElement('span', { 'data-slot': 'title' }, title),
      search
        ? React.createElement('input', {
            'data-slot': 'search',
            value: search.value,
            placeholder: search.placeholder,
            id: search.id,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => search.onChange?.(e.target.value),
          })
        : null,
      React.createElement('span', { 'data-slot': 'actions' }, actions),
    ),
}));

// SelectPrimitive passthrough — every part renders its children inline.
vi.mock('@radix-ui/react-select', () => {
  const passthrough = (
    name: string,
  ): React.FC<{ children?: React.ReactNode } & Record<string, unknown>> => {
    const FC: React.FC<{ children?: React.ReactNode } & Record<string, unknown>> = (props) =>
      React.createElement('div', { 'data-radix': name, ...props }, props.children);
    FC.displayName = `Select.${name}`;
    return FC;
  };
  return {
    Root: passthrough('Root'),
    Trigger: passthrough('Trigger'),
    Portal: passthrough('Portal'),
    Content: passthrough('Content'),
    Viewport: passthrough('Viewport'),
    Item: passthrough('Item'),
    ItemText: passthrough('ItemText'),
    Icon: passthrough('Icon'),
  };
});

import { BlocksSection } from '../sections/blocks-section';
import type { CategoryDef, ComponentDef } from '../types';

// ─── Tree-walker ───────────────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    try {
      const FC = el.type as (props: unknown) => React.ReactNode;
      yield* walk(FC(el.props) as ReactNodeLike);
    } catch {
      /* skip */
    }
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

/**
 * Drain helper — clear the recorder, do a single throwaway walk so the
 * mocks fire once (per the rf-pdpl-18 walker side-effect learning), then
 * snapshot. This separates "the walker invokes FCs" from "we need a
 * stable per-render call list."
 */
function drainComponentItemCalls(tree: React.ReactNode): Array<Record<string, unknown>> {
  mocks.componentItemCalls.length = 0;
  for (const _el of walk(tree)) void _el;
  const snapshot = mocks.componentItemCalls.slice();
  mocks.componentItemCalls.length = 0;
  return snapshot;
}

function drainDraggableGroupCalls(tree: React.ReactNode): Array<Record<string, unknown>> {
  mocks.draggableGroupCalls.length = 0;
  for (const _el of walk(tree)) void _el;
  const snapshot = mocks.draggableGroupCalls.slice();
  mocks.draggableGroupCalls.length = 0;
  return snapshot;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const FakeIcon = vi.fn(() => React.createElement('svg', { 'data-icon': 'FakeIcon' }));

function makeCategory(overrides: Partial<CategoryDef> = {}): CategoryDef {
  return {
    id: 'Compute',
    label: 'Compute',
    icon: FakeIcon as unknown as CategoryDef['icon'],
    color: '#22c55e',
    tooltip: 'Compute tooltip',
    ...overrides,
  };
}

function makeComponent(overrides: Partial<ComponentDef> = {}): ComponentDef {
  return {
    type: 'Compute.Container',
    name: 'Container',
    description: 'desc',
    tooltip: 'tt',
    icon: FakeIcon as unknown as ComponentDef['icon'],
    providers: ['aws', 'gcp', 'azure'],
    category: 'Compute',
    ...overrides,
  };
}

function makeProps(overrides: Partial<Parameters<typeof BlocksSection>[0]> = {}) {
  const cat = makeCategory();
  const comp = makeComponent();
  return {
    localSearch: '',
    setLocalSearch: vi.fn(),
    selectedProvider: 'all',
    setSelectedProvider: vi.fn(),
    projectProvider: null,
    searchInputRef: { current: null },
    filteredComponents: [comp],
    categorizedItems: [{ category: cat, items: [comp] }],
    isSearching: false,
    showGroup: true,
    collapsedCategories: new Set<string>(),
    toggleCategory: vi.fn(),
    mounted: false,
    staggerIdx: 0,
    ...overrides,
  };
}

const renderSection = (props: Parameters<typeof BlocksSection>[0]): React.ReactElement =>
  (BlocksSection as unknown as (p: Parameters<typeof BlocksSection>[0]) => React.ReactElement)(props);

beforeEach(() => {
  mocks.componentItemCalls.length = 0;
  mocks.draggableGroupCalls.length = 0;
  mocks.brandIcon = null;
});

// ─── Tests: outer container ────────────────────────────────────────────────

describe('BlocksSection — outer container', () => {
  it('returns a single root <div> with h-full flex flex-col classes', () => {
    const tree = renderSection(makeProps());
    expect(tree.type).toBe('div');
    const className = (tree.props as { className: string }).className;
    expect(className).toContain('h-full');
    expect(className).toContain('flex-col');
  });

  it('renders the PanelHeader stub at the top', () => {
    const tree = renderSection(makeProps());
    const headers = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'header' && props['data-stub'] === 'PanelHeader';
    });
    expect(headers).toHaveLength(1);
  });
});

// ─── Tests: panel header wiring ────────────────────────────────────────────

describe('BlocksSection — panel header', () => {
  it('forwards palette.title and palette.searchPlaceholder via t()', () => {
    const tree = renderSection(makeProps({ localSearch: 'redis' }));
    const titles = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && props['data-slot'] === 'title';
    });
    expect(titles).toHaveLength(1);
    expect((titles[0].props as { children: React.ReactNode }).children).toBe('palette.title');

    const searches = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'input' && props['data-slot'] === 'search';
    });
    expect(searches).toHaveLength(1);
    const props = searches[0].props as Record<string, unknown>;
    expect(props.placeholder).toBe('palette.searchPlaceholder');
    expect(props.value).toBe('redis');
    expect(props.id).toBe('ice-palette-search-input');
  });

  it('forwards setLocalSearch through the panel-header search onChange', () => {
    const setLocalSearch = vi.fn();
    const tree = renderSection(makeProps({ setLocalSearch }));
    const inputs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'input' && props['data-slot'] === 'search';
    });
    const onChange = (inputs[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange;
    onChange({ target: { value: 'redis' } });
    expect(setLocalSearch).toHaveBeenCalledWith('redis');
  });
});

// ─── Tests: provider dropdown ──────────────────────────────────────────────

describe('BlocksSection — provider dropdown', () => {
  it('renders Globe icon in the trigger when selectedProvider is "all" (no brand)', () => {
    mocks.brandIcon = null;
    const tree = renderSection(makeProps({ selectedProvider: 'all' }));
    // Globe is forwardRef — predicate by className containing w-3.5 + h-3.5
    // and not being the inline-search slot.
    const icons = findByPredicate(tree, (el) => {
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-3.5') && cn.includes('h-3.5');
    });
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders an <img> in the trigger when getBrandIcon returns a descriptor', () => {
    mocks.brandIcon = { url: 'https://example.com/aws.svg' };
    const tree = renderSection(makeProps({ selectedProvider: 'aws' }));
    const imgs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'img' && (props.src as string)?.includes('aws.svg');
    });
    expect(imgs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders one Item per PROVIDER (3 entries)', () => {
    const tree = renderSection(makeProps());
    const items = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-radix'] === 'Item';
    });
    expect(items).toHaveLength(3);
  });

  it('disables non-matching items when projectProvider is set', () => {
    const tree = renderSection(makeProps({ projectProvider: 'gcp', selectedProvider: 'gcp' }));
    const items = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-radix'] === 'Item';
    });
    const allItem = items.find((i) => (i.props as { value?: string }).value === 'all');
    const awsItem = items.find((i) => (i.props as { value?: string }).value === 'aws');
    const gcpItem = items.find((i) => (i.props as { value?: string }).value === 'gcp');
    // 'all' is never locked; aws is locked (project is gcp); gcp is selected, not locked.
    expect((allItem?.props as { disabled?: boolean }).disabled).toBe(false);
    expect((awsItem?.props as { disabled?: boolean }).disabled).toBe(true);
    expect((gcpItem?.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('does not lock any item when projectProvider is null', () => {
    const tree = renderSection(makeProps({ projectProvider: null }));
    const items = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-radix'] === 'Item';
    });
    for (const item of items) {
      expect((item.props as { disabled?: boolean }).disabled).toBe(false);
    }
  });

  it('renders Check next to the active provider', () => {
    mocks.brandIcon = null;
    const tree = renderSection(makeProps({ selectedProvider: 'aws' }));
    const items = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-radix'] === 'Item';
    });
    // Walk items and look for the lucide Check by className; only one should
    // carry a child with class containing `text-blue-400` (the source's
    // active-marker color).
    const awsItem = items.find((i) => (i.props as { value?: string }).value === 'aws');
    const checks = findByPredicate(awsItem!, (el) => {
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('text-blue-400');
    });
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Tests: category groups ────────────────────────────────────────────────

describe('BlocksSection — category groups', () => {
  it('renders a button header per category when not searching', () => {
    const tree = renderSection(
      makeProps({
        categorizedItems: [
          { category: makeCategory({ id: 'Compute', label: 'Compute' }), items: [makeComponent()] },
          { category: makeCategory({ id: 'Network', label: 'Network', color: '#06b6d4' }), items: [] },
        ],
        isSearching: false,
      }),
    );
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    // 2 category headers — items lengths 1 + 0.
    expect(buttons).toHaveLength(2);
  });

  it('omits category headers when isSearching is true', () => {
    const tree = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory(), items: [makeComponent()] }],
        isSearching: true,
      }),
    );
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    expect(buttons).toHaveLength(0);
  });

  it('header click forwards toggleCategory(category.id)', () => {
    const toggleCategory = vi.fn();
    const tree = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'Network' }), items: [] }],
        toggleCategory,
      }),
    );
    const buttons = findByPredicate(tree, (el) => el.type === 'button');
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(toggleCategory).toHaveBeenCalledWith('Network');
  });

  it('chevron span onClick stops propagation AND forwards toggleCategory(category.id)', () => {
    const toggleCategory = vi.fn();
    const stopPropagation = vi.fn();
    const tree = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'AI' }), items: [] }],
        toggleCategory,
      }),
    );
    // Find the inner span carrying the chevron's onClick (the one with class
    // 'w-4 h-4').
    const spans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('w-4') && cn.includes('h-4') && cn.includes('hover:bg-ice-hover');
    });
    expect(spans).toHaveLength(1);
    const onClick = (spans[0].props as { onClick: (e: { stopPropagation: () => void }) => void }).onClick;
    onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(toggleCategory).toHaveBeenCalledWith('AI');
  });

  it('omits ComponentItem children when category is collapsed', () => {
    const tree = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'Compute' }), items: [makeComponent()] }],
        collapsedCategories: new Set(['Compute']),
      }),
    );
    const calls = drainComponentItemCalls(tree);
    expect(calls).toHaveLength(0);
  });

  it('renders ComponentItem children when category is not collapsed', () => {
    const c1 = makeComponent({ type: 'Compute.A' });
    const c2 = makeComponent({ type: 'Compute.B' });
    const tree = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'Compute' }), items: [c1, c2] }],
        collapsedCategories: new Set(),
      }),
    );
    const calls = drainComponentItemCalls(tree);
    expect(calls).toHaveLength(2);
    expect((calls[0].component as ComponentDef).type).toBe('Compute.A');
    expect((calls[1].component as ComponentDef).type).toBe('Compute.B');
  });

  it('forwards categoryColor and selectedProvider to each ComponentItem', () => {
    const tree = renderSection(
      makeProps({
        selectedProvider: 'gcp',
        categorizedItems: [
          {
            category: makeCategory({ id: 'Network', color: '#06b6d4' }),
            items: [makeComponent({ type: 'Network.Gateway' })],
          },
        ],
      }),
    );
    const calls = drainComponentItemCalls(tree);
    expect(calls).toHaveLength(1);
    expect(calls[0].categoryColor).toBe('#06b6d4');
    expect(calls[0].selectedProvider).toBe('gcp');
  });

  it('staggerIndex increments across categories on first mount (mounted=false)', () => {
    const tree = renderSection(
      makeProps({
        mounted: false,
        staggerIdx: 0,
        categorizedItems: [
          { category: makeCategory({ id: 'A' }), items: [makeComponent({ type: 'a1' }), makeComponent({ type: 'a2' })] },
          { category: makeCategory({ id: 'B' }), items: [makeComponent({ type: 'b1' })] },
        ],
      }),
    );
    const calls = drainComponentItemCalls(tree);
    expect(calls.map((c) => c.staggerIndex)).toEqual([0, 1, 2]);
  });

  it('staggerIndex is 0 for every item once mounted is true', () => {
    const tree = renderSection(
      makeProps({
        mounted: true,
        staggerIdx: 5,
        categorizedItems: [
          { category: makeCategory({ id: 'A' }), items: [makeComponent({ type: 'a1' }), makeComponent({ type: 'a2' })] },
        ],
      }),
    );
    const calls = drainComponentItemCalls(tree);
    expect(calls.every((c) => c.staggerIndex === 0)).toBe(true);
  });

  it('header span carries category.color when expanded; undefined when collapsed', () => {
    const expanded = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'X', color: '#abcdef' }), items: [] }],
        collapsedCategories: new Set(),
      }),
    );
    const spans1 = findByPredicate(expanded, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && (props.style as React.CSSProperties)?.color === '#abcdef';
    });
    expect(spans1.length).toBe(1);

    const collapsed = renderSection(
      makeProps({
        categorizedItems: [{ category: makeCategory({ id: 'X', color: '#abcdef' }), items: [] }],
        collapsedCategories: new Set(['X']),
      }),
    );
    const spans2 = findByPredicate(collapsed, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && (props.style as React.CSSProperties)?.color === undefined && (props.style as React.CSSProperties)?.opacity === 0.5;
    });
    expect(spans2.length).toBe(1);
  });
});

// ─── Tests: empty state ────────────────────────────────────────────────────

describe('BlocksSection — empty state', () => {
  it('renders the noBlocksFound + noBlocksHint paragraphs when filteredComponents is empty AND showGroup is false', () => {
    const tree = renderSection(
      makeProps({
        filteredComponents: [],
        categorizedItems: [],
        showGroup: false,
      }),
    );
    const ps = findByPredicate(tree, (el) => el.type === 'p');
    // Two <p> elements expected (noBlocksFound + noBlocksHint).
    expect(ps).toHaveLength(2);
  });

  it('omits the noBlocksFound block when showGroup is true (group affordance covers the empty case)', () => {
    const tree = renderSection(
      makeProps({
        filteredComponents: [],
        categorizedItems: [],
        showGroup: true,
      }),
    );
    const ps = findByPredicate(tree, (el) => el.type === 'p');
    expect(ps).toHaveLength(0);
  });

  it('renders the divider only when showGroup is true AND filteredComponents has entries', () => {
    const withItems = renderSection(
      makeProps({ filteredComponents: [makeComponent()], showGroup: true }),
    );
    const divs1 = findByPredicate(withItems, (el) => {
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('h-px') && cn.includes('bg-gradient-to-r');
    });
    expect(divs1.length).toBe(1);

    const empty = renderSection(
      makeProps({ filteredComponents: [], categorizedItems: [], showGroup: true }),
    );
    const divs2 = findByPredicate(empty, (el) => {
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('h-px') && cn.includes('bg-gradient-to-r');
    });
    expect(divs2).toHaveLength(0);
  });
});

// ─── Tests: DraggableGroupItem ──────────────────────────────────────────────

describe('BlocksSection — DraggableGroupItem', () => {
  it('renders DraggableGroupItem when showGroup is true', () => {
    const tree = renderSection(makeProps({ showGroup: true }));
    const calls = drainDraggableGroupCalls(tree);
    expect(calls).toHaveLength(1);
  });

  it('does not render DraggableGroupItem when showGroup is false', () => {
    const tree = renderSection(makeProps({ showGroup: false }));
    const calls = drainDraggableGroupCalls(tree);
    expect(calls).toHaveLength(0);
  });
});
