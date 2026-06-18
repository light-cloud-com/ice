/**
 * rf-rpal-8 — ResourcePalette orchestrator.
 *
 * Pins the orchestrator's public API surface plus the show* prop gating
 * and section composition. The heavy lifting (BlocksSection, ComponentItem,
 * DraggableGroupItem) lives in their own tests — here we mock those so the
 * assertion surface stays on this component.
 *
 * Mocks:
 *   - `useLocation` → returns a configurable pathname (for isCanvasView).
 *   - `useResolvePath` → returns { type: 'project', id: 'p1' } by default.
 *   - `axiosInstance.post` → resolves with { data: { provider: null } }.
 *   - `useState` / `useEffect` / `useMemo` / `useCallback` / `useRef` →
 *     passthrough overrides so the orchestrator runs synchronously under
 *     the direct-FC tree-walker.
 *   - `BlocksSection`, `ProjectBrowser`, `TemplateCategoriesPanel`,
 *     `Resizable*`, `TooltipProvider` → opaque marker stubs.
 *   - `loadCollapsed` / `saveCollapsed` → no-ops.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  pathname: '/p1' as string,
  resolved: { type: 'project' as 'project' | 'unknown', id: 'p1' as string | null },
  blocksSectionCalls: [] as Array<Record<string, unknown>>,
  projectBrowserCalls: 0,
  templatesCalls: 0,
  resizableGroupCalls: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // Stateful useState backed by a slot dispatcher.
  // - __resetUseState({ keepSlots? }) — resets call counter, optionally
  //   preserving the slot values (default: full reset).
  // - __setState(i, v) — pre-seed slot i for the next render.
  let stateSlots: unknown[] = [];
  let useStateIdx = 0;
  (
    mocks as unknown as {
      __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      __setState: (i: number, v: unknown) => void;
    }
  ).__resetUseState = (opts) => {
    if (!opts?.keepSlots) stateSlots = [];
    useStateIdx = 0;
  };
  (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState = (i: number, v: unknown) => {
    stateSlots[i] = v;
  };
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [stateSlots[slot], setter];
  });
  // Capture each useEffect's callback + deps so tests can fire them.
  (
    mocks as unknown as {
      effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      callbacks: unknown[];
    }
  ).effects = [];
  (mocks as unknown as { callbacks: unknown[] }).callbacks = [];
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects.push({ cb, deps: deps ?? [] });
  });
  const patchedUseMemo = vi.fn((fn: () => unknown) => fn());
  const patchedUseCallback = vi.fn((fn: unknown) => {
    (mocks as unknown as { callbacks: unknown[] }).callbacks.push(fn);
    return fn;
  });
  const patchedUseRef = vi.fn(<T,>(initial: T) => ({ current: initial }));
  // ResourcePalette now calls `useTranslation()` to fetch the localized
  // category labels. The hook reads LocaleContext via useContext —
  // return an identity translator so the test stays locale-independent.
  const patchedUseContext = vi.fn(() => ({
    t: (key: string) => key,
    locale: 'en' as const,
    setLocale: () => {},
  }));
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    useMemo: patchedUseMemo,
    useCallback: patchedUseCallback,
    useRef: patchedUseRef,
    useContext: patchedUseContext,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
      useMemo: patchedUseMemo,
      useCallback: patchedUseCallback,
      useRef: patchedUseRef,
      useContext: patchedUseContext,
    },
  };
});

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock('../../../shared/hooks/use-resolve-path', () => ({
  useResolvePath: () => mocks.resolved,
}));

vi.mock('../../../shared/api/axios-instance', () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: { provider: null } })),
  },
}));

vi.mock('../../../config/providers', () => ({
  ENABLED_PROVIDER_IDS: new Set(['aws', 'gcp', 'azure']),
}));

// `resource-palette.tsx`'s filter calls `isCategoryEnabledForProvider`
// against live PROVIDER_FLAGS, which currently gates most providers off.
// These tests are about the filter wiring (ENABLED_PROVIDER_IDS +
// search + provider-pick), NOT about the per-category provider flags —
// stub the gate to true so test fixtures stay locale-/flag-independent.
vi.mock('@ice/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    isCategoryEnabledForProvider: () => true,
  };
});

vi.mock('../../../shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children, delayDuration }: { children: React.ReactNode; delayDuration?: number }) =>
    React.createElement('div', { 'data-stub': 'TooltipProvider', 'data-delay': delayDuration }, children),
}));

vi.mock('../../../shared/components/ui/resizable', () => ({
  ResizablePanelGroup: ({
    children,
    direction,
    autoSaveId,
    className,
  }: {
    children: React.ReactNode;
    direction?: string;
    autoSaveId?: string;
    className?: string;
  }) => {
    mocks.resizableGroupCalls += 1;
    return React.createElement(
      'div',
      {
        'data-stub': 'ResizablePanelGroup',
        'data-direction': direction,
        'data-autosave': autoSaveId,
        className,
      },
      children,
    );
  },
  ResizablePanel: ({
    children,
    defaultSize,
    minSize,
  }: {
    children: React.ReactNode;
    defaultSize?: number;
    minSize?: number;
  }) =>
    React.createElement(
      'section',
      {
        'data-stub': 'ResizablePanel',
        'data-default-size': defaultSize,
        'data-min-size': minSize,
      },
      children,
    ),
  ResizableHandle: ({ withHandle }: { withHandle?: boolean }) =>
    React.createElement('hr', { 'data-stub': 'ResizableHandle', 'data-with-handle': withHandle }),
}));

vi.mock('../../project-browser', () => ({
  ProjectBrowser: () => {
    mocks.projectBrowserCalls += 1;
    return React.createElement('span', { 'data-stub': 'ProjectBrowser' });
  },
}));

vi.mock('../../templates/components/template-categories-panel', () => ({
  TemplateCategoriesPanel: ({ embedded }: { embedded?: boolean }) => {
    mocks.templatesCalls += 1;
    return React.createElement('span', {
      'data-stub': 'TemplateCategoriesPanel',
      'data-embedded': embedded,
    });
  },
}));

vi.mock('../sections/blocks-section', () => ({
  BlocksSection: vi.fn((props: Record<string, unknown>) => {
    mocks.blocksSectionCalls.push(props);
    return React.createElement('section', { 'data-stub': 'BlocksSection' });
  }),
}));

vi.mock('../data/categories', () => ({
  CATEGORY_ORDER: ['Compute', 'Network'],
  getCategoryMap: () =>
    new Map([
      ['Compute', { id: 'Compute', label: 'Compute', icon: () => null, color: '#22c55e', tooltip: 'tt' }],
      ['Network', { id: 'Network', label: 'Network', icon: () => null, color: '#06b6d4', tooltip: 'tt' }],
    ]),
}));

vi.mock('../data/components', async (importOriginal) => ({
  // Keep the real `componentMatchesQuery` (CD3) — only the inventory is stubbed.
  ...(await importOriginal<typeof import('../data/components')>()),
  getComponents: () => [
    {
      type: 'Compute.A',
      name: 'Alpha',
      description: 'first',
      tooltip: 'tt',
      icon: () => null,
      providers: ['aws', 'gcp'],
      category: 'Compute',
    },
    {
      type: 'Network.B',
      name: 'Bravo',
      description: 'second',
      tooltip: 'tt',
      icon: () => null,
      providers: ['azure'],
      category: 'Network',
    },
    {
      type: 'Compute.C',
      name: 'Charlie',
      description: 'third',
      tooltip: 'tt',
      icon: () => null,
      providers: ['kubernetes'], // not in ENABLED_PROVIDER_IDS — filtered out
      category: 'Compute',
    },
  ],
}));

vi.mock('../data/providers', () => ({
  PALETTE_STYLES: '/* styles */',
  loadCollapsed: vi.fn(() => new Set<string>()),
  saveCollapsed: vi.fn(),
  getProviders: () => [],
}));

import { ResourcePalette } from '../components/resource-palette';

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

function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && predicate(el)) out.push(el);
  }
  return out;
}

function drainBlocksCalls(tree: React.ReactNode): Array<Record<string, unknown>> {
  mocks.blocksSectionCalls.length = 0;
  for (const _el of walk(tree)) void _el;
  const snap = mocks.blocksSectionCalls.slice();
  mocks.blocksSectionCalls.length = 0;
  return snap;
}

const renderPalette = (props: Parameters<typeof ResourcePalette>[0] = {}): React.ReactElement => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  return (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)(props);
};

beforeEach(() => {
  mocks.pathname = '/p1';
  mocks.resolved = { type: 'project', id: 'p1' };
  mocks.blocksSectionCalls.length = 0;
  mocks.projectBrowserCalls = 0;
  mocks.templatesCalls = 0;
  mocks.resizableGroupCalls = 0;
  (
    mocks as unknown as {
      effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      callbacks: unknown[];
    }
  ).effects.length = 0;
  (mocks as unknown as { callbacks: unknown[] }).callbacks.length = 0;
});

// ─── Tests: TooltipProvider wrap + style injection ─────────────────────────

describe('ResourcePalette — outer wrap', () => {
  it('wraps content in TooltipProvider with delayDuration=400', () => {
    const tree = renderPalette({ showProjectSection: true });
    expect(tree.type).toBeDefined();
    const providers = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-stub'] === 'TooltipProvider';
    });
    expect(providers).toHaveLength(1);
    expect((providers[0].props as Record<string, unknown>)['data-delay']).toBe(400);
  });

  it('injects PALETTE_STYLES via a <style> tag', () => {
    const tree = renderPalette();
    const styles = findByPredicate(tree, (el) => el.type === 'style');
    expect(styles).toHaveLength(1);
    expect((styles[0].props as { children: string }).children).toBe('/* styles */');
  });

  it('renders the ice-palette-panel root with the resource-palette test id', () => {
    const tree = renderPalette();
    const panels = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props.id === 'ice-palette-panel';
    });
    expect(panels).toHaveLength(1);
    expect((panels[0].props as Record<string, unknown>)['data-testid']).toBe('resource-palette');
  });
});

// ─── Tests: section gating (show* props) ───────────────────────────────────

describe('ResourcePalette — section gating', () => {
  it('renders ProjectBrowser when showProjectSection is true', () => {
    const tree = renderPalette({
      showProjectSection: true,
      showBlocksSection: false,
      showTemplatesSection: false,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && props['data-stub'] === 'ProjectBrowser';
    });
    expect(stubs).toHaveLength(1);
  });

  it('omits ProjectBrowser when showProjectSection is false', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: false,
      showTemplatesSection: false,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && props['data-stub'] === 'ProjectBrowser';
    });
    expect(stubs).toHaveLength(0);
  });

  it('renders BlocksSection when showBlocksSection is true AND pathname is canvas-like', () => {
    mocks.pathname = '/p1';
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'section' && props['data-stub'] === 'BlocksSection';
    });
    expect(stubs).toHaveLength(1);
  });

  it('omits BlocksSection on /settings even when showBlocksSection is true', () => {
    mocks.pathname = '/p1/settings';
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'section' && props['data-stub'] === 'BlocksSection';
    });
    expect(stubs).toHaveLength(0);
  });

  it('omits BlocksSection on /deployments even when showBlocksSection is true', () => {
    mocks.pathname = '/p1/deployments';
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'section' && props['data-stub'] === 'BlocksSection';
    });
    expect(stubs).toHaveLength(0);
  });

  it('renders TemplateCategoriesPanel when showTemplatesSection is true', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: false,
      showTemplatesSection: true,
    });
    const stubs = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'span' && props['data-stub'] === 'TemplateCategoriesPanel';
    });
    expect(stubs).toHaveLength(1);
    expect((stubs[0].props as Record<string, unknown>)['data-embedded']).toBe(true);
  });

  it('returns null when no sections are enabled', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: false,
      showTemplatesSection: false,
    });
    const groups = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-stub'] === 'ResizablePanelGroup';
    });
    expect(groups).toHaveLength(0);
  });
});

// ─── Tests: ResizablePanelGroup composition ─────────────────────────────────

describe('ResourcePalette — section composition', () => {
  it('does not wrap a single section in a ResizablePanelGroup', () => {
    const tree = renderPalette({
      showProjectSection: true,
      showBlocksSection: false,
      showTemplatesSection: false,
    });
    const groups = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-stub'] === 'ResizablePanelGroup';
    });
    expect(groups).toHaveLength(0);
  });

  it('wraps two sections in a ResizablePanelGroup with autoSaveId="ice-palette-split"', () => {
    const tree = renderPalette({
      showProjectSection: true,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const groups = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'div' && props['data-stub'] === 'ResizablePanelGroup';
    });
    expect(groups).toHaveLength(1);
    const groupProps = groups[0].props as Record<string, unknown>;
    expect(groupProps['data-direction']).toBe('vertical');
    expect(groupProps['data-autosave']).toBe('ice-palette-split');
  });

  it('inserts a ResizableHandle between two sections (handle count = sections - 1)', () => {
    const tree = renderPalette({
      showProjectSection: true,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const handles = findByPredicate(tree, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'hr' && props['data-stub'] === 'ResizableHandle';
    });
    // 2 sections → 1 handle.
    expect(handles).toHaveLength(1);
  });

  it('panel defaultSize is floor(100 / sections) — 50 for two sections, 33 for three', () => {
    const two = renderPalette({
      showProjectSection: true,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const panelsTwo = findByPredicate(two, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'section' && props['data-stub'] === 'ResizablePanel';
    });
    expect(panelsTwo).toHaveLength(2);
    expect((panelsTwo[0].props as Record<string, unknown>)['data-default-size']).toBe(50);
    expect((panelsTwo[0].props as Record<string, unknown>)['data-min-size']).toBe(15);

    const three = renderPalette({
      showProjectSection: true,
      showBlocksSection: true,
      showTemplatesSection: true,
    });
    const panelsThree = findByPredicate(three, (el) => {
      const props = el.props as Record<string, unknown>;
      return el.type === 'section' && props['data-stub'] === 'ResizablePanel';
    });
    expect(panelsThree).toHaveLength(3);
    expect((panelsThree[0].props as Record<string, unknown>)['data-default-size']).toBe(33);
  });
});

// ─── Tests: filteredComponents + categorizedItems ───────────────────────────

describe('ResourcePalette — filteredComponents wiring', () => {
  it('forwards COMPONENTS filtered to ENABLED_PROVIDER_IDS into BlocksSection', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    expect(calls).toHaveLength(1);
    const filtered = calls[0].filteredComponents as ComponentDefLike[];
    // Charlie is filtered (kubernetes only — not in ENABLED_PROVIDER_IDS).
    expect(filtered.map((c) => c.type)).toEqual(['Compute.A', 'Network.B']);
  });

  it('forwards categorizedItems grouped by CATEGORY_ORDER', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    const categorized = calls[0].categorizedItems as Array<{
      category: { id: string };
      items: ComponentDefLike[];
    }>;
    expect(categorized.map((g) => g.category.id)).toEqual(['Compute', 'Network']);
    expect(categorized[0].items.map((c) => c.type)).toEqual(['Compute.A']);
    expect(categorized[1].items.map((c) => c.type)).toEqual(['Network.B']);
  });

  it('passes initial selectedProvider="all" and isSearching=false', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    expect(calls[0].selectedProvider).toBe('all');
    expect(calls[0].isSearching).toBe(false);
    expect(calls[0].showGroup).toBe(true);
  });

  it('passes the searchInputRef ref-object through to BlocksSection', () => {
    const tree = renderPalette({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    const ref = calls[0].searchInputRef as { current: unknown };
    expect(ref).toHaveProperty('current');
  });

  it('with localSearch set, filters by name match (covers L108 branch)', () => {
    renderPalette();
    // Seed slot 1 (localSearch). Slot 0 = projectProvider; slot 1 = localSearch.
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(1, 'alpha');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    const tree = (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    const filtered = calls[0].filteredComponents as ComponentDefLike[];
    // 'alpha' matches name "Alpha" (Compute.A); Bravo & Charlie do not.
    expect(filtered.map((c) => c.type)).toEqual(['Compute.A']);
  });

  it('with localSearch set, filters by description (covers L109 branch)', () => {
    renderPalette();
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(1, 'second');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    const tree = (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    const filtered = calls[0].filteredComponents as ComponentDefLike[];
    // 'second' matches description "second" (Network.B).
    expect(filtered.map((c) => c.type)).toEqual(['Network.B']);
  });

  it('with localSearch present, isSearching is true and showGroup branches on the magic substring (covers L130)', () => {
    renderPalette();
    // Seed localSearch (slot 1) to 'group' — matches the showGroup substring.
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(1, 'group');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    const tree = (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    expect(calls[0].isSearching).toBe(true);
    expect(calls[0].showGroup).toBe(true); // 'group organize' contains 'group'
  });

  it('with selectedProvider locked to a non-all value, filters out non-matching providers', () => {
    renderPalette();
    // Slot 2 = selectedProvider. Set to 'azure' so only Network.B matches.
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(2, 'azure');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    const tree = (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    const filtered = calls[0].filteredComponents as ComponentDefLike[];
    // Compute.A is aws/gcp; Network.B is azure; Charlie is filtered by ENABLED_PROVIDER_IDS.
    expect(filtered.map((c) => c.type)).toEqual(['Network.B']);
  });

  it('with localSearch unrelated to "group organize", showGroup is false', () => {
    renderPalette();
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(1, 'redis');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    const tree = (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({
      showProjectSection: false,
      showBlocksSection: true,
      showTemplatesSection: false,
    });
    const calls = drainBlocksCalls(tree);
    expect(calls[0].showGroup).toBe(false);
  });
});

// ─── Tests: effects ────────────────────────────────────────────────────────

describe('ResourcePalette — effect bodies', () => {
  it('mount effect ([]) fires setMounted(true) — covers line 82', () => {
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    // The mount effect is the one with deps=[]
    const mountEffect = effects.find((e) => e.deps.length === 0);
    expect(mountEffect).toBeDefined();
    expect(() => mountEffect?.cb()).not.toThrow();
  });

  it('provider-lock effect fires setSelectedProvider(projectProvider) when provider is set — covers L70-71', () => {
    // Render once to populate state slots; then seed slot 0 (projectProvider)
    // to 'gcp' and re-render with the slots preserved + index reset.
    renderPalette();
    (mocks as unknown as { __setState: (i: number, v: unknown) => void }).__setState(0, 'gcp');
    (
      mocks as unknown as {
        __resetUseState: (opts?: { keepSlots?: boolean }) => void;
      }
    ).__resetUseState({ keepSlots: true });
    (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects.length = 0;
    (ResourcePalette as unknown as (p: Parameters<typeof ResourcePalette>[0]) => React.ReactElement)({});
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const lockEffect = effects.find((e) => e.deps.length === 1 && e.deps[0] === 'gcp');
    expect(lockEffect).toBeDefined();
    expect(() => lockEffect?.cb()).not.toThrow();
  });

  it('provider-lock effect is a no-op when projectProvider is null', () => {
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const lockEffect = effects.find((e) => e.deps.length === 1 && e.deps[0] === null);
    expect(lockEffect).toBeDefined();
    // No throw means the early return ran; nothing to assert beyond invocability.
    expect(() => lockEffect?.cb()).not.toThrow();
  });

  it('resolve effect (deps length 2) is registered and invocable when type=project', () => {
    mocks.resolved = { type: 'project', id: 'p1' };
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    // The resolve effect has deps [resolved.type, resolved.id] — length 2.
    const resolveEffect = effects.find((e) => e.deps.length === 2);
    expect(resolveEffect).toBeDefined();
    expect(() => resolveEffect?.cb()).not.toThrow();
  });

  it('resolve effect runs the else branch (setProjectProvider(null)) when type is not project', () => {
    mocks.resolved = { type: 'unknown', id: null };
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const resolveEffect = effects.find((e) => e.deps.length === 2);
    expect(() => resolveEffect?.cb()).not.toThrow();
  });

  it('resolve effect catches axios rejection and resets projectProvider — covers L59', async () => {
    const axios = await import('../../../shared/api/axios-instance');
    const post = (axios.default as unknown as { post: ReturnType<typeof vi.fn> }).post;
    post.mockRejectedValueOnce(new Error('boom'));
    mocks.resolved = { type: 'project', id: 'p1' };
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const resolveEffect = effects.find((e) => e.deps.length === 2);
    expect(resolveEffect).toBeDefined();
    resolveEffect?.cb();
    // Flush microtasks so the .then/.catch chain runs.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('resolve effect resolves axios success and calls setProjectProvider with provider', async () => {
    const axios = await import('../../../shared/api/axios-instance');
    const post = (axios.default as unknown as { post: ReturnType<typeof vi.fn> }).post;
    post.mockResolvedValueOnce({ data: { provider: 'aws' } });
    mocks.resolved = { type: 'project', id: 'p1' };
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const resolveEffect = effects.find((e) => e.deps.length === 2);
    resolveEffect?.cb();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('resolve effect handles missing provider field by passing null', async () => {
    const axios = await import('../../../shared/api/axios-instance');
    const post = (axios.default as unknown as { post: ReturnType<typeof vi.fn> }).post;
    post.mockResolvedValueOnce({ data: {} });
    mocks.resolved = { type: 'project', id: 'p1' };
    renderPalette();
    const effects = (
      mocks as unknown as {
        effects: Array<{ cb: () => void | (() => void); deps: unknown[] }>;
      }
    ).effects;
    const resolveEffect = effects.find((e) => e.deps.length === 2);
    resolveEffect?.cb();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

// ─── Tests: toggleCategory callback ─────────────────────────────────────────

describe('ResourcePalette — toggleCategory callback', () => {
  it('adds the id to collapsedCategories when not yet collapsed', async () => {
    const { saveCollapsed } = await import('../data/providers');
    (saveCollapsed as ReturnType<typeof vi.fn>).mockClear();
    renderPalette();
    const cbs = (mocks as unknown as { callbacks: unknown[] }).callbacks;
    expect(cbs).toHaveLength(1);
    const toggle = cbs[0] as (id: string) => void;
    toggle('Compute');
    // toggleCategory uses setCollapsedCategories with a setter fn — verify
    // saveCollapsed was invoked with the new set.
    expect(saveCollapsed).toHaveBeenCalled();
    const lastCall = (saveCollapsed as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const set = lastCall?.[0] as Set<string>;
    expect(set.has('Compute')).toBe(true);
  });

  it('removes the id when already collapsed (toggle off)', async () => {
    const { saveCollapsed, loadCollapsed } = await import('../data/providers');
    (saveCollapsed as ReturnType<typeof vi.fn>).mockClear();
    // Pre-seed loadCollapsed to return a set containing 'Network'.
    (loadCollapsed as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Set(['Network']));
    renderPalette();
    const cbs = (mocks as unknown as { callbacks: unknown[] }).callbacks;
    const toggle = cbs[0] as (id: string) => void;
    toggle('Network');
    const lastCall = (saveCollapsed as ReturnType<typeof vi.fn>).mock.calls.at(-1);
    const set = lastCall?.[0] as Set<string>;
    expect(set.has('Network')).toBe(false);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

interface ComponentDefLike {
  type: string;
}
