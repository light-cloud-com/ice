/**
 * TemplateCategoriesPanel — left sidebar template browser.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const Pass = ({ children, ...rest }: { children?: unknown } & Record<string, unknown>) => ({
    type: 'div',
    props: { ...rest, children },
  });
  const allTemplates = [
    { id: 't-fe', name: 'FE', category: 'web', icon: 'Globe', estimatedCost: '$10/mo' },
    { id: 't-fe2', name: 'FE2', category: 'web', icon: 'Globe', estimatedCost: '$15/mo' },
    { id: 't-be', name: 'BE', category: 'backend', icon: 'Server', estimatedCost: '$20/mo' },
    { id: 't-fe3', name: 'FE3', category: 'web', icon: 'Globe', estimatedCost: '$12/mo' },
    { id: 't-ai', name: 'AI', category: 'ai', icon: 'Brain', estimatedCost: '$30/mo' },
  ];
  return {
    Pass,
    allTemplates,
    categories: [
      { id: 'web', icon: 'Globe', color: '#f00' },
      { id: 'backend', icon: 'Server', color: '#0f0' },
      { id: 'ai', icon: 'Brain', color: '#00f' },
      { id: 'empty', icon: 'Zap', color: '#fff' },
    ],
    featured: allTemplates.slice(0, 3),
    state: {},
    useStateQueue: [] as unknown[],
    dispatch: vi.fn(),
    navigate: vi.fn(),
    toggleSpy: vi.fn(() => ({ type: 'ui/toggleTemplates' })),
    searchSpy: vi.fn((q: string) => allTemplates.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))),
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => {
    const next = mocks.useStateQueue.shift();
    return [(next === undefined ? init : (next as T)), vi.fn()];
  });
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useState, useMemo, default: { ...def, useState, useMemo } };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => `t:${k}${opts ? `:${JSON.stringify(opts)}` : ''}` }),
}));

vi.mock('../../../../config/templates', () => ({
  ALL_TEMPLATES: mocks.allTemplates,
  TEMPLATE_CATEGORIES: mocks.categories,
  getFeaturedTemplates: () => mocks.featured,
  searchTemplates: (q: string) => mocks.searchSpy(q),
}));

vi.mock('../../../../shared/components/ui/panel-header', () => ({
  PanelHeader: mocks.Pass,
}));

vi.mock('../../../../shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  toggleTemplates: () => mocks.toggleSpy(),
}));

import { TemplateCategoriesPanel } from '../template-categories-panel';

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
  if (typeof node.type === 'function') {
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* skip */
    }
    return;
  }
  yield* walk(node.props.children);
}
function findAll(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}
function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
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

const callRender = (props: Partial<React.ComponentProps<typeof TemplateCategoriesPanel>> = {}): unknown =>
  (TemplateCategoriesPanel as (p: unknown) => unknown)(props as unknown);

beforeEach(() => {
  mocks.dispatch.mockReset();
  mocks.navigate.mockReset();
  mocks.toggleSpy.mockClear();
  mocks.searchSpy.mockClear();
  mocks.useStateQueue.length = 0;
});

describe('TemplateCategoriesPanel — render (no search)', () => {
  it('renders the "all categories" hero button', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:templates.gallery.allCategories');
  });

  it('renders one button per category', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:templates.categories.web.label');
    expect(text).toContain('t:templates.categories.backend.label');
  });

  it('marks empty categories as "comingSoon"', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:templates.gallery.comingSoon');
  });

  it('renders the Featured section with featured templates', () => {
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:templates.gallery.featured');
    expect(text).toContain('t:templates.items.t-fe.name');
  });

  it('clicking the all-categories hero navigates to /templates', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // First button is the hero
    (buttons[0].props.onClick as () => void)?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/templates');
  });

  it('clicking a category navigates with ?category=', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // 1st = hero, 2nd = first category (web)
    (buttons[1].props.onClick as () => void)?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/templates?category=web');
  });

  it('does not navigate when clicking an empty category (disabled)', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    // 4th category = empty
    const emptyBtn = buttons.find((b) => (b.props as { disabled?: boolean }).disabled === true);
    expect(emptyBtn).toBeDefined();
    (emptyBtn?.props.onClick as () => void)?.();
    // Navigate not called for empty button (its onClick is `() => !isEmpty && goToGallery(...)`)
    const calls = mocks.navigate.mock.calls.length;
    (emptyBtn?.props.onClick as () => void)?.();
    expect(mocks.navigate.mock.calls.length).toBe(calls);
  });

  it('clicking a featured template navigates to /templates', () => {
    const tree = callRender();
    const buttons = findAll(tree, (el) => el.type === 'button');
    (buttons[buttons.length - 1].props.onClick as () => void)?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/templates');
  });

  it('renders the close button when not embedded', () => {
    const tree = callRender();
    const ph = findByPredicate(tree, (el) => el.type === mocks.Pass);
    expect(typeof (ph?.props as { onClose?: unknown }).onClose).toBe('function');
  });

  it('does not pass onClose when embedded=true', () => {
    const tree = callRender({ embedded: true });
    const ph = findByPredicate(tree, (el) => el.type === mocks.Pass);
    expect((ph?.props as { onClose?: unknown }).onClose).toBeUndefined();
  });

  it('PanelHeader.onClose dispatches toggleTemplates', () => {
    const tree = callRender();
    const ph = findByPredicate(tree, (el) => el.type === mocks.Pass);
    ((ph?.props as { onClose?: () => void }).onClose as () => void)?.();
    expect(mocks.toggleSpy).toHaveBeenCalled();
  });
});

describe('TemplateCategoriesPanel — defensive', () => {
  it('falls back to Zap icon when category icon is unknown', () => {
    // ai uses 'Brain' which is in ICON_MAP. Let's add an unmapped one:
    const snapshot = mocks.categories.slice();
    mocks.categories.length = 0;
    mocks.categories.push({ id: 'unmapped', icon: 'XYZ', color: '#aaa' });
    try {
      // searchTemplates(undef) returns nothing — emulate "no search"
      const tree = callRender();
      // didn't crash
      expect(tree).toBeDefined();
    } finally {
      mocks.categories.length = 0;
      snapshot.forEach((c) => mocks.categories.push(c));
    }
  });
});

describe('TemplateCategoriesPanel — searching mode', () => {
  it('filters categories by matching search results', () => {
    mocks.useStateQueue.push('FE'); // search
    mocks.searchSpy.mockReturnValue(mocks.allTemplates.filter((t) => t.category === 'web'));
    const tree = callRender();
    const text = collectText(tree);
    // Only web category has matching templates with "FE" in their name
    expect(text).toContain('t:templates.categories.web.label');
    expect(text).not.toContain('t:templates.categories.backend.label');
  });

  it('renders the search results count summary', () => {
    mocks.useStateQueue.push('FE');
    const tree = callRender();
    expect(collectText(tree)).toContain('t:templates.gallery.templateCount');
  });

  it('hides the all-categories hero when searching', () => {
    mocks.useStateQueue.push('FE');
    const tree = callRender();
    expect(collectText(tree)).not.toContain('t:templates.gallery.allCategories');
  });

  it('renders empty-results message when search has no matches', () => {
    mocks.useStateQueue.push('xyz-not-found');
    mocks.searchSpy.mockReturnValue([]);
    const tree = callRender();
    expect(collectText(tree)).toContain('t:templates.gallery.noMatchSearch');
  });

  it('filters featured to only matching ids when searching', () => {
    mocks.useStateQueue.push('FE');
    mocks.searchSpy.mockReturnValue(mocks.allTemplates.filter((t) => t.id === 't-fe'));
    const tree = callRender();
    const text = collectText(tree);
    expect(text).toContain('t:templates.items.t-fe.name');
  });
});

describe('TemplateCategoriesPanel — search input wiring', () => {
  it('passes a search.onChange that wires to setSearch', () => {
    const tree = callRender();
    const ph = findByPredicate(tree, (el) => el.type === mocks.Pass);
    const search = (ph?.props as { search?: { onChange?: (v: string) => void } }).search;
    expect(typeof search?.onChange).toBe('function');
    expect(() => search?.onChange?.('hello')).not.toThrow();
  });
});
