/**
 * rf-tgal-6 — TemplateGalleryDialog orchestrator.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 pattern).
 *
 * Mocks:
 *   - react hooks (useState/useEffect/useMemo/useCallback) — passthrough
 *     overrides (per react-namespace-hook-access-requires-patching-default-export-too)
 *   - useTranslation → returns the key verbatim.
 *   - useDispatch → returns a spy; useSelector → returns from a controllable
 *     in-test slice fixture.
 *   - ALL_TEMPLATES / TEMPLATE_CATEGORIES / searchTemplates /
 *     getFeaturedTemplates / expandComposedTemplate — small in-test stubs.
 *   - TemplateCard / TemplateDetail → opaque markers.
 *   - axiosInstance.post → resolves with { data: ... }.
 *
 * The handleUseTemplate async flow is the orchestrator's heavy lift —
 * tests pin the four-step sequence (create/update/get/cards-update),
 * the orgId-conditional fetchProjectTree dispatch, and the navigation
 * via window.location.href.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  let useStateIdx = 0;
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  return {
    stateSlots,
    useStateIdx,
    effects,
    callbacks: [] as unknown[],
    resetUseState: () => {
      stateSlots.length = 0;
    },
    selectors: {
      isOpen: false as boolean,
      initialCategory: null as string | null,
    },
    selectedOrg: { id: 'org-1', name: 'Acme Co' } as { id: string; name: string } | null,
    dispatch: vi.fn(),
    axios: {
      post: vi.fn(),
    },
    expandComposedTemplate: vi.fn(),
    fetchProjectTree: vi.fn((id: string) => ({ type: 'projects/fetch', payload: id })),
    locationHref: '' as string,
    closeTemplateGallery: () => ({ type: 'ui/closeTemplateGallery' }),
  };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  let useStateIdx = 0;
  const patchedUseState = vi.fn((initial?: unknown) => {
    const slot = useStateIdx;
    if (mocks.stateSlots.length <= slot) {
      const init = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      mocks.stateSlots.push(init);
    }
    const setter = vi.fn((next: unknown) => {
      const cur = mocks.stateSlots[slot];
      const resolved = typeof next === 'function' ? (next as (prev: unknown) => unknown)(cur) : next;
      mocks.stateSlots[slot] = resolved;
    });
    useStateIdx += 1;
    return [mocks.stateSlots[slot], setter];
  });
  // Reset on each invocation
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx = () => {
    useStateIdx = 0;
  };
  const patchedUseEffect = vi.fn((cb: () => void | (() => void), deps?: unknown[]) => {
    mocks.effects.push({ cb, deps: deps ?? [] });
  });
  const patchedUseMemo = vi.fn((fn: () => unknown) => fn());
  const patchedUseCallback = vi.fn((fn: unknown) => {
    mocks.callbacks.push(fn);
    return fn;
  });
  const actualDefault = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return {
    ...actual,
    useState: patchedUseState,
    useEffect: patchedUseEffect,
    useMemo: patchedUseMemo,
    useCallback: patchedUseCallback,
    default: {
      ...actualDefault,
      useState: patchedUseState,
      useEffect: patchedUseEffect,
      useMemo: patchedUseMemo,
      useCallback: patchedUseCallback,
    },
  };
});

vi.mock('react-redux', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: (s: unknown) => unknown) =>
    selector({
      ui: {
        dialogs: { templateGallery: mocks.selectors.isOpen },
        templateGalleryCategory: mocks.selectors.initialCategory,
      },
      account: { selectedOrg: mocks.selectedOrg },
    }),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../../config/templates', () => ({
  ALL_TEMPLATES: [
    {
      id: 'tpl-a',
      name: 'Tpl A',
      icon: 'Rocket',
      category: 'web',
      tags: [],
      blocks: [],
      connections: [],
      environmentPresets: [],
      featured: true,
      provider: 'aws',
    },
    {
      id: 'tpl-b',
      name: 'Tpl B',
      icon: 'Rocket',
      category: 'ai',
      tags: [],
      blocks: [],
      connections: [],
      environmentPresets: [],
    },
  ],
  TEMPLATE_CATEGORIES: [
    { id: 'web', label: 'Web', icon: 'Globe', color: '#3b82f6' },
    { id: 'ai', label: 'AI', icon: 'Brain', color: '#a855f7' },
    { id: 'empty', label: 'Empty', icon: 'Cloud', color: '#22c55e' },
  ],
  searchTemplates: (q: string, pool: unknown[]) =>
    q ? (pool as Array<{ name: string }>).filter((t) => t.name.toLowerCase().includes(q.toLowerCase())) : pool,
  getFeaturedTemplates: () => [
    {
      id: 'tpl-a',
      name: 'Tpl A',
      icon: 'Rocket',
      category: 'web',
      tags: [],
      blocks: [],
      connections: [],
      environmentPresets: [],
      featured: true,
      provider: 'aws',
    },
  ],
  expandComposedTemplate: (...args: unknown[]) => mocks.expandComposedTemplate(...args),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: (...args: unknown[]) => mocks.axios.post(...args) },
}));

vi.mock('../../../../shared/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: { children?: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) => (
    <div data-stub="Dialog" data-open={String(open ?? false)} data-onchange={onOpenChange ? 'set' : 'unset'}>
      {children}
    </div>
  ),
  DialogContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-stub="DialogContent" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('../../../../shared/components/ui/search-input', () => ({
  SearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input data-stub="SearchInput" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

vi.mock('../template-card', () => ({
  TemplateCard: ({ template, onSelect }: { template: { id: string; name: string }; onSelect: (t: { id: string }) => void }) => (
    <button data-stub="TemplateCard" data-template-id={template.id} onClick={() => onSelect(template)}>
      {template.name}
    </button>
  ),
}));

vi.mock('../template-detail', () => ({
  TemplateDetail: ({ template, onBack, onUse }: { template: { id: string }; onBack: () => void; onUse: (t: { id: string }) => void }) => (
    <div data-stub="TemplateDetail" data-template-id={template.id}>
      <button data-stub="back" onClick={onBack}>
        back
      </button>
      <button data-stub="use" onClick={() => onUse(template)}>
        use
      </button>
    </div>
  ),
}));

vi.mock('../../../../store', () => ({
  store: {
    getState: () => ({ account: { selectedOrg: mocks.selectedOrg } }),
  },
}));

vi.mock('../../../../store/slices/ui-slice', () => ({
  closeTemplateGallery: () => mocks.closeTemplateGallery(),
}));

vi.mock('../../../../store/slices/projects-slice', () => ({
  fetchProjectTree: (id: string) => mocks.fetchProjectTree(id),
}));

import { TemplateGalleryDialog } from '../template-gallery';

// ─── Tree-walker helpers ──────────────────────────────────────────────────

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

function render(): React.ReactElement | null {
  (mocks as unknown as { __resetIdx: () => void }).__resetIdx();
  return (TemplateGalleryDialog as unknown as () => React.ReactElement | null)();
}

// ─── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.callbacks.length = 0;
  mocks.dispatch.mockReset();
  mocks.axios.post.mockReset();
  mocks.expandComposedTemplate.mockReset();
  mocks.fetchProjectTree.mockClear();
  mocks.selectors.isOpen = true;
  mocks.selectors.initialCategory = null;
  mocks.selectedOrg = { id: 'org-1', name: 'Acme Co' };
  mocks.expandComposedTemplate.mockReturnValue({ nodes: [], edges: [] });
  mocks.locationHref = '';
  vi.stubGlobal('window', {
    location: {
      get href() {
        return mocks.locationHref;
      },
      set href(v: string) {
        mocks.locationHref = v;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Closed branch ────────────────────────────────────────────────────────

describe('TemplateGalleryDialog — closed', () => {
  it('returns null when isOpen is false', () => {
    mocks.selectors.isOpen = false;
    const tree = render();
    expect(tree).toBeNull();
  });
});

// ─── List view ────────────────────────────────────────────────────────────

describe('TemplateGalleryDialog — list view', () => {
  it('renders a Dialog wrapper', () => {
    const tree = render();
    expect(tree).not.toBeNull();
    const dialogs = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' && (el.props as { ['data-stub']: string })['data-stub'] === 'Dialog',
    );
    expect(dialogs.length).toBe(1);
    expect((dialogs[0].props as { ['data-open']: string })['data-open']).toBe('true');
  });

  it('renders the header title + subtitle i18n keys', () => {
    const tree = render();
    let text = '';
    for (const el of walk(tree)) {
      const c = (el.props as { children?: unknown }).children;
      if (typeof c === 'string') text += c + '|';
    }
    expect(text).toContain('templates.gallery.title');
    expect(text).toContain('templates.gallery.subtitle');
  });

  it('renders a category tab per TEMPLATE_CATEGORIES + the "all" tab', () => {
    const tree = render();
    const tabBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('rounded-full'),
    );
    // 1 'all' + 3 categories = 4
    expect(tabBtns.length).toBe(4);
  });

  it('marks empty-count category tabs with opacity-40', () => {
    const tree = render();
    const dimmedBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('opacity-40'),
    );
    // 'empty' category has 0 templates → dimmed
    expect(dimmedBtns.length).toBe(1);
  });

  it('renders the featured group when activeCategory=all and search empty', () => {
    const tree = render();
    const cards = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' && (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateCard',
    );
    // Featured row has tpl-a (1) + grouped row also lists tpl-a (omitted from featured filter) — so
    // expect tpl-b in groups + tpl-a in featured.
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const ids = cards.map((c) => (c.props as { ['data-template-id']: string })['data-template-id']);
    expect(ids).toContain('tpl-a');
    expect(ids).toContain('tpl-b');
  });

  it('shows the empty-results panel when search yields no matches', () => {
    // Pre-seed search slot 0=search, 1=activeCategory, 2=selectedTemplate
    mocks.stateSlots[0] = 'no-such-template';
    const tree = render();
    let text = '';
    for (const el of walk(tree)) {
      const c = (el.props as { children?: unknown }).children;
      if (typeof c === 'string') text += c + '|';
      if (Array.isArray(c)) {
        for (const item of c) {
          if (typeof item === 'string') text += item + '|';
        }
      }
    }
    expect(text).toContain('templates.noResults');
  });

  it('shows the empty-category message when filter+empty cat with no search', () => {
    // Pre-seed: search='' (slot 0), activeCategory='empty' (slot 1)
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'empty';
    const tree = render();
    let text = '';
    for (const el of walk(tree)) {
      const c = (el.props as { children?: unknown }).children;
      if (typeof c === 'string') text += c + '|';
      if (Array.isArray(c)) {
        for (const item of c) {
          if (typeof item === 'string') text += item + '|';
        }
      }
    }
    expect(text).toContain('templates.gallery.emptyCategory');
  });
});

// ─── Detail view ──────────────────────────────────────────────────────────

describe('TemplateGalleryDialog — detail view', () => {
  it('renders TemplateDetail when selectedTemplate is set', () => {
    // Pre-seed slot 2 = selectedTemplate
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'all';
    mocks.stateSlots[2] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    const details = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' && (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateDetail',
    );
    expect(details.length).toBe(1);
    expect((details[0].props as { ['data-template-id']: string })['data-template-id']).toBe('tpl-a');
  });

  it('detail view back button is wired (callback exists)', () => {
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'all';
    mocks.stateSlots[2] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    // The original <TemplateDetail> JSX element carries onBack/onUse on props;
    // the inner <div data-stub="TemplateDetail"> rendered by the mock does NOT.
    // Probe for the FC-invocation site via the props.template.id.
    const detail = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { template?: { id?: string } }).template?.id === 'tpl-a',
    )[0];
    expect(detail).toBeDefined();
    const backFn = (detail.props as { onBack: () => void }).onBack;
    expect(typeof backFn).toBe('function');
    // Invoking it pushes null into setSelectedTemplate slot — we won't observe since
    // useState mock just stores; the wiring presence is the assertion.
  });
});

// ─── handleUseTemplate flow ───────────────────────────────────────────────

describe('TemplateGalleryDialog — handleUseTemplate', () => {
  it('full success: posts /create, /update, /get, /cards/update; dispatches fetchProjectTree; closes; navigates', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create
      .mockResolvedValueOnce({ data: {} }) // /update (provider)
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } }) // /get
      .mockResolvedValueOnce({ data: {} }); // /cards/update
    mocks.expandComposedTemplate.mockReturnValue({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] });

    const tree = render();
    // `handleUseTemplate` is the callback at index 0 (handleUseTemplate first, handleClose second)
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    expect(typeof handleUseTemplate).toBe('function');

    const tpl = {
      id: 'tpl-a',
      name: 'My App',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    };
    await handleUseTemplate(tpl);

    expect(mocks.axios.post).toHaveBeenCalledTimes(4);
    expect(mocks.axios.post.mock.calls[0]).toEqual([
      '/canvas/projects/create',
      { name: 'My App', type: 'project', organisationId: 'org-1' },
    ]);
    expect(mocks.axios.post.mock.calls[1]).toEqual([
      '/canvas/projects/update',
      { projectId: 'proj-1', provider: 'aws', region: 'us-east-1' },
    ]);
    expect(mocks.axios.post.mock.calls[2]).toEqual(['/canvas/projects/get', { projectId: 'proj-1' }]);
    expect(mocks.axios.post.mock.calls[3]).toEqual([
      '/canvas/cards/update',
      { cardId: 'card-1', nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] },
    ]);

    // dispatch was called with fetchProjectTree(orgId) and closeTemplateGallery
    const dispatchedTypes = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('projects/fetch');
    expect(dispatchedTypes).toContain('ui/closeTemplateGallery');
    // navigation
    expect(mocks.locationHref).toBe('/acme-co/my-app');
    // tree must not be null (sanity)
    expect(tree).not.toBeNull();
  });

  it('skips /update + /get + /cards/update when template.provider is undefined', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } }) // /get (always)
      .mockResolvedValueOnce({ data: {} }); // /cards/update

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    const tpl = {
      id: 'tpl-x',
      name: 'X',
      provider: undefined,
      environmentPresets: [],
    };
    await handleUseTemplate(tpl);

    // /update call is skipped (no template.provider)
    const paths = mocks.axios.post.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(['/canvas/projects/create', '/canvas/projects/get', '/canvas/cards/update']);
  });

  it('falls back to slug from template.name when project.slug is missing', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1' /* no slug */ } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } })
      .mockResolvedValueOnce({ data: {} });

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-z',
      name: 'My Cool App',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    expect(mocks.locationHref).toBe('/acme-co/my-cool-app');
  });

  it('uses bare /slug path when orgName is unset', async () => {
    mocks.selectedOrg = null;
    mocks.axios.post.mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'lone-app' } });

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-l',
      name: 'Lone',
      provider: undefined,
      environmentPresets: [],
    });
    expect(mocks.locationHref).toBe('/lone-app');
  });

  it('returns early without dispatching close when /create rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.axios.post.mockRejectedValueOnce(new Error('500'));

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-fail',
      name: 'Fail',
      provider: undefined,
      environmentPresets: [],
    });

    // No dispatch (close not called) and no navigation
    const dispatchedTypes = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).not.toContain('ui/closeTemplateGallery');
    expect(mocks.locationHref).toBe('');
    consoleErrorSpy.mockRestore();
  });

  it('continues to close + navigate when non-critical inner steps fail', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create OK
      .mockRejectedValueOnce(new Error('flaky update')); // /update fails

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-r',
      name: 'R',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    const dispatchedTypes = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('ui/closeTemplateGallery');
    expect(mocks.locationHref).toBe('/acme-co/my-app');
    consoleWarnSpy.mockRestore();
  });
});

// ─── handleClose ──────────────────────────────────────────────────────────

describe('TemplateGalleryDialog — handleClose', () => {
  it('handleClose dispatches closeTemplateGallery', () => {
    render();
    const handleClose = mocks.callbacks[1] as () => void;
    handleClose();
    const dispatchedTypes = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('ui/closeTemplateGallery');
  });
});

// ─── Initial-category sync useEffect ──────────────────────────────────────

describe('TemplateGalleryDialog — initial-category sync effect', () => {
  it('registers a useEffect with [isOpen, initialCategory] deps', () => {
    render();
    expect(mocks.effects.length).toBeGreaterThanOrEqual(1);
    expect(mocks.effects[0].deps).toEqual([true, null]);
  });

  it('initial-category sync resets when isOpen and initialCategory both set', () => {
    mocks.selectors.initialCategory = 'web';
    // Pre-seed prior-render state
    mocks.stateSlots[0] = 'previous-search';
    mocks.stateSlots[1] = 'previous-cat';
    mocks.stateSlots[2] = { id: 'prev', name: 'Prev' };
    render();
    // Run the effect
    mocks.effects[0].cb();
    // After effect: search='', activeCategory='web', selectedTemplate=null
    expect(mocks.stateSlots[0]).toBe('');
    expect(mocks.stateSlots[1]).toBe('web');
    expect(mocks.stateSlots[2]).toBeNull();
  });

  it("initial-category sync resets to 'all' when initialCategory is null", () => {
    mocks.selectors.initialCategory = null;
    mocks.stateSlots[0] = 'previous-search';
    mocks.stateSlots[1] = 'previous-cat';
    mocks.stateSlots[2] = { id: 'prev', name: 'Prev' };
    render();
    mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('all');
    expect(mocks.stateSlots[2]).toBeNull();
  });

  it('effect body short-circuits when isOpen is false', () => {
    // Note: the early return `if (!isOpen) return null` happens AFTER the
    // hook registration (rules of hooks), so the effect IS still registered;
    // its body just no-ops.
    mocks.selectors.isOpen = false;
    mocks.stateSlots[0] = 'preserve-me';
    mocks.stateSlots[1] = 'preserve-cat';
    mocks.stateSlots[2] = { id: 'preserve-tpl' };
    const tree = render();
    expect(tree).toBeNull();
    expect(mocks.effects.length).toBe(1);
    mocks.effects[0].cb();
    // No state mutations
    expect(mocks.stateSlots[0]).toBe('preserve-me');
    expect(mocks.stateSlots[1]).toBe('preserve-cat');
    expect(mocks.stateSlots[2]).toEqual({ id: 'preserve-tpl' });
  });
});

// ─── Tab + filter onClicks (extra branch coverage) ────────────────────────

describe('TemplateGalleryDialog — tab + filter wiring', () => {
  it('the "all" tab button updates activeCategory to "all"', () => {
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'web';
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('rounded-full') &&
        (el.props as { children?: unknown }).children === 'templates.gallery.allCategories',
    );
    expect(tabs.length).toBe(1);
    (tabs[0].props as { onClick: () => void }).onClick();
    expect(mocks.stateSlots[1]).toBe('all');
  });

  it('per-category tab button updates activeCategory to that category id', () => {
    const tree = render();
    const tabs = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        ((el.props as { className?: string }).className ?? '').includes('rounded-full') &&
        Array.isArray((el.props as { children?: unknown }).children),
    );
    // tabs are: 'web', 'ai', 'empty' (non-"all" labels)
    expect(tabs.length).toBeGreaterThanOrEqual(1);
    (tabs[0].props as { onClick: () => void }).onClick();
    // The first dynamic tab is web (TEMPLATE_CATEGORIES[0])
    expect(mocks.stateSlots[1]).toBe('web');
  });

  it('SearchInput onChange updates the search slot', () => {
    const tree = render();
    const inputs = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'SearchInput',
    );
    expect(inputs.length).toBe(1);
    (inputs[0].props as { onChange: (e: { target: { value: string } }) => void }).onChange({
      target: { value: 'foo' },
    });
    expect(mocks.stateSlots[0]).toBe('foo');
  });

  it('TemplateCard click invokes setSelectedTemplate via onSelect', () => {
    const tree = render();
    const cards = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateCard',
    );
    expect(cards.length).toBeGreaterThanOrEqual(1);
    (cards[0].props as { onClick: () => void }).onClick();
    // slot 2 is selectedTemplate
    expect(mocks.stateSlots[2]).toBeDefined();
    expect(mocks.stateSlots[2]).not.toBeNull();
  });

  it('detail-view onBack callback resets selectedTemplate to null', () => {
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'all';
    mocks.stateSlots[2] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    // Find the TemplateDetail React element to read onBack
    const detail = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        (el.props as { template?: { id?: string } }).template?.id === 'tpl-a',
    )[0];
    expect(detail).toBeDefined();
    (detail.props as { onBack: () => void }).onBack();
    // After invocation slot 2 should be null
    expect(mocks.stateSlots[2]).toBeNull();
  });

  it('Dialog onOpenChange(false) routes through handleClose', () => {
    const tree = render();
    // Find the JSX <Dialog> FC element (the original, before the mock replaces it).
    const dialogs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { onOpenChange?: unknown }).onOpenChange === 'function',
    );
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    (dialogs[0].props as { onOpenChange: (open: boolean) => void }).onOpenChange(false);
    const types = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ui/closeTemplateGallery');
  });

  it('Dialog onOpenChange(true) does NOT close', () => {
    const tree = render();
    const dialogs = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { onOpenChange?: unknown }).onOpenChange === 'function',
    );
    (dialogs[0].props as { onOpenChange: (open: boolean) => void }).onOpenChange(true);
    const types = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('ui/closeTemplateGallery');
  });

  it('detail-view Dialog onOpenChange(false) closes the gallery', () => {
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'all';
    mocks.stateSlots[2] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    const dialog = findByPredicate(
      tree,
      (el) =>
        typeof el.type === 'function' &&
        typeof (el.props as { onOpenChange?: unknown }).onOpenChange === 'function',
    )[0];
    (dialog.props as { onOpenChange: (open: boolean) => void }).onOpenChange(false);
    const types = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('ui/closeTemplateGallery');
  });

  it('handleUseTemplate falls back to "" when environmentPresets[0] is missing', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'app' } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } })
      .mockResolvedValueOnce({ data: {} });

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-x',
      name: 'X',
      provider: 'aws',
      environmentPresets: [], // empty → ?.region falls through to ''
    });
    expect(mocks.axios.post.mock.calls[1]).toEqual([
      '/canvas/projects/update',
      { projectId: 'proj-1', provider: 'aws', region: '' },
    ]);
  });

  it('handleUseTemplate skips fetchProjectTree when no orgId', async () => {
    mocks.selectedOrg = null;
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'lone-app' } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } })
      .mockResolvedValueOnce({ data: {} });

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-z',
      name: 'Z',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    // No 'projects/fetch' dispatch since orgId is null
    const types = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('projects/fetch');
  });

  it('handleUseTemplate skips /cards/update when project response has no card', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'app' } })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: { cards: [] } }) // no cards
      .mockResolvedValueOnce({ data: {} });

    render();
    const handleUseTemplate = mocks.callbacks[0] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-q',
      name: 'Q',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    const paths = mocks.axios.post.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(['/canvas/projects/create', '/canvas/projects/update', '/canvas/projects/get']);
  });

  it('renders no featured group when activeCategory is set', () => {
    mocks.stateSlots[0] = '';
    mocks.stateSlots[1] = 'web';
    const tree = render();
    let text = '';
    for (const el of walk(tree)) {
      const c = (el.props as { children?: unknown }).children;
      if (typeof c === 'string') text += c + '|';
    }
    // Featured banner is gated on activeCategory==='all' && !search
    expect(text).not.toContain('templates.gallery.featured');
  });
});
