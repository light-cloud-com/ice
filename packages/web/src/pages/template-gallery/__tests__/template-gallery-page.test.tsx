/**
 * rf-wgal-7 — TemplateGalleryPage orchestrator.
 *
 * Direct-FC tree-walker (rf-rpal-8 / rf-pdpl-7..15 / rf-pset-5 / rf-tgal-6 pattern).
 *
 * Mocks:
 *   - react hooks (useState/useEffect/useMemo/useCallback) — passthrough
 *     overrides (per react-namespace-hook-access-requires-patching-default-export-too).
 *   - useTranslation → returns the key verbatim.
 *   - useDispatch → spy.
 *   - useNavigate → spy.
 *   - useSearchParams → returns [URLSearchParams, setSearchParams spy].
 *   - ALL_TEMPLATES / TEMPLATE_CATEGORIES / searchTemplates /
 *     getFeaturedTemplates / expandComposedTemplate — small in-test stubs.
 *   - TemplateCard / TemplateDetail / FilterChip / SearchInput → opaque
 *     markers.
 *   - axiosInstance.post → resolves with { data: ... }.
 *   - store.getState → returns a controllable selectedOrg slice.
 *
 * The handleUseTemplate async flow is the orchestrator's heavy lift —
 * tests pin the four-step sequence (create/update/get/cards-update),
 * the orgId-conditional fetchProjectTree dispatch, and the
 * navigate(basePath) call (NOT window.location.href, which the web
 * page deliberately switched away from per the long comment in the
 * source).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateSlots: unknown[] = [];
  const effects: Array<{ cb: () => void | (() => void); deps: unknown[] }> = [];
  return {
    stateSlots,
    effects,
    callbacks: [] as unknown[],
    resetUseState: () => {
      stateSlots.length = 0;
    },
    searchParamsBacking: new URLSearchParams() as URLSearchParams,
    setSearchParams: vi.fn(),
    selectedOrg: { id: 'org-1', name: 'Acme Co' } as { id: string; name: string } | null,
    dispatch: vi.fn(),
    navigate: vi.fn(),
    axios: {
      post: vi.fn(),
    },
    expandComposedTemplate: vi.fn(),
    fetchProjectTree: vi.fn((id: string) => ({ type: 'projects/fetch', payload: id })),
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
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [mocks.searchParamsBacking, mocks.setSearchParams],
}));

vi.mock('@ui/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@ui/config/templates', () => ({
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
      providers: ['aws'],
      difficulty: 'starter',
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
      providers: ['gcp'],
      difficulty: 'expert',
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

vi.mock('@ui/shared/api/axios-instance', () => ({
  default: { post: (...args: unknown[]) => mocks.axios.post(...args) },
}));

vi.mock('@ui/shared/components/ui/search-input', () => ({
  SearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input data-stub="SearchInput" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  ),
}));

vi.mock('../components/template-card', () => ({
  TemplateCard: ({ template, onSelect }: { template: { id: string; name: string }; onSelect: (t: { id: string }) => void }) => (
    <button data-stub="TemplateCard" data-template-id={template.id} onClick={() => onSelect(template)}>
      {template.name}
    </button>
  ),
}));

vi.mock('../components/template-detail', () => ({
  TemplateDetail: ({ template, onClose, onUse }: { template: { id: string }; onClose: () => void; onUse: (t: { id: string }) => void }) => (
    <div data-stub="TemplateDetail" data-template-id={template.id}>
      <button data-stub="close" onClick={onClose}>
        close
      </button>
      <button data-stub="use" onClick={() => onUse(template)}>
        use
      </button>
    </div>
  ),
}));

vi.mock('../components/filter-chip', () => ({
  FilterChip: ({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) => (
    <button data-stub="FilterChip" data-active={String(active)} data-count={count != null ? String(count) : ''} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock('@ui/store', () => ({
  store: {
    getState: () => ({ account: { selectedOrg: mocks.selectedOrg } }),
  },
}));

vi.mock('@ui/store/slices/projects-slice', () => ({
  fetchProjectTree: (id: string) => mocks.fetchProjectTree(id),
}));

import { TemplateGalleryPage } from '../../template-gallery';

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
  return (TemplateGalleryPage as unknown as () => React.ReactElement | null)();
}

// ─── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.resetUseState();
  mocks.effects.length = 0;
  mocks.callbacks.length = 0;
  mocks.dispatch.mockReset();
  mocks.navigate.mockReset();
  mocks.axios.post.mockReset();
  mocks.expandComposedTemplate.mockReset();
  mocks.fetchProjectTree.mockClear();
  mocks.setSearchParams.mockReset();
  mocks.searchParamsBacking = new URLSearchParams();
  mocks.selectedOrg = { id: 'org-1', name: 'Acme Co' };
  mocks.expandComposedTemplate.mockReturnValue({ nodes: [], edges: [] });
});

// ─── Root structure ───────────────────────────────────────────────────────

describe('TemplateGalleryPage — root structure', () => {
  it('renders an h1 with the gallery title i18n key', () => {
    const tree = render();
    const h1 = findByPredicate(tree, (el) => el.type === 'h1')[0];
    expect(h1).toBeDefined();
    expect((h1.props as { children: unknown }).children).toBe('templates.gallery.title');
  });

  it('renders the SearchInput with the searchPlaceholder i18n key', () => {
    const tree = render();
    const searchInputs = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'SearchInput',
    );
    expect(searchInputs).toHaveLength(1);
    expect((searchInputs[0].props as { placeholder: string }).placeholder).toBe('templates.searchPlaceholder');
  });

  it('renders a count of filtered templates', () => {
    const tree = render();
    const counts = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('tabular-nums'),
    );
    expect(counts).toHaveLength(1);
    // count={2} for 2 ALL_TEMPLATES
    expect((counts[0].props as { children: unknown }).children).toBe('templates.gallery.templateCount');
  });
});

// ─── Filter chips ─────────────────────────────────────────────────────────

describe('TemplateGalleryPage — filter chips', () => {
  it('renders a category chip per non-empty category + "all"', () => {
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    // 1 'all' + 2 non-empty categories (web,ai) + 3 providers (gcp,aws,azure) + 4 difficulties = 10
    expect(chips.length).toBe(10);
  });

  it('skips category chips with zero matching templates', () => {
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const categoryChipLabels = chips.map((c) => (c.props as { children: unknown }).children);
    // the empty-cat chip never renders (count=0 → filter returns null)
    expect(categoryChipLabels).not.toContain('templates.categories.empty.label');
  });

  it('renders 3 provider chips (gcp / aws / azure) with uppercase labels', () => {
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const labels = chips.map((c) => (c.props as { children: unknown }).children);
    expect(labels).toContain('GCP');
    expect(labels).toContain('AWS');
    expect(labels).toContain('AZURE');
  });

  it('renders 4 difficulty chips (starter / intermediate / advanced / expert)', () => {
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const labels = chips.map((c) => (c.props as { children: unknown }).children);
    expect(labels).toContain('templates.gallery.difficultyStarter');
    expect(labels).toContain('templates.gallery.difficultyIntermediate');
    expect(labels).toContain('templates.gallery.difficultyAdvanced');
    expect(labels).toContain('templates.gallery.difficultyExpert');
  });

  it('marks the "all" chip active when no category param', () => {
    mocks.searchParamsBacking = new URLSearchParams();
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const allChip = chips.find((c) => (c.props as { children: unknown }).children === 'templates.gallery.allCategories');
    expect((allChip!.props as { ['data-active']: string })['data-active']).toBe('true');
  });

  it('marks the matching category chip active when category param is set', () => {
    mocks.searchParamsBacking = new URLSearchParams('category=ai');
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const aiChip = chips.find((c) => (c.props as { children: unknown }).children === 'templates.categories.ai.label');
    expect((aiChip!.props as { ['data-active']: string })['data-active']).toBe('true');
  });

  it('marks the matching provider chip active when provider param is set', () => {
    mocks.searchParamsBacking = new URLSearchParams('provider=aws');
    const tree = render();
    const chips = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'FilterChip',
    );
    const awsChip = chips.find((c) => (c.props as { children: unknown }).children === 'AWS');
    expect((awsChip!.props as { ['data-active']: string })['data-active']).toBe('true');
  });

  it('shows the clearFilters button when any filter is active', () => {
    mocks.searchParamsBacking = new URLSearchParams('category=ai');
    const tree = render();
    const clearBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-ice-text-1') &&
        (el.props as { className: string }).className.includes('ml-2'),
    );
    expect(clearBtns).toHaveLength(1);
  });

  it('hides the clearFilters button when no filter is active', () => {
    mocks.searchParamsBacking = new URLSearchParams();
    const tree = render();
    const clearBtns = findByPredicate(
      tree,
      (el) =>
        el.type === 'button' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('hover:text-ice-text-1') &&
        (el.props as { className: string }).className.includes('ml-2'),
    );
    expect(clearBtns).toHaveLength(0);
  });
});

// ─── Grid rendering ───────────────────────────────────────────────────────

describe('TemplateGalleryPage — grid', () => {
  it('renders the featured group when no filter is active', () => {
    mocks.searchParamsBacking = new URLSearchParams();
    const tree = render();
    const cards = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateCard',
    );
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const ids = cards.map((c) => (c.props as { ['data-template-id']: string })['data-template-id']);
    expect(ids).toContain('tpl-a');
    expect(ids).toContain('tpl-b');
  });

  it('hides featured group when category param is set', () => {
    mocks.searchParamsBacking = new URLSearchParams('category=web');
    const tree = render();
    // The "Featured" header is the i18n key 'templates.gallery.featured';
    // we shouldn't find it as a span child string when filtered.
    const featuredLabels = findByPredicate(
      tree,
      (el) =>
        el.type === 'span' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-ice-accent') &&
        (el.props as { children?: unknown }).children === 'templates.gallery.featured',
    );
    expect(featuredLabels).toHaveLength(0);
  });

  it('renders the empty-state when filtered.length=0 and search is set', () => {
    mocks.searchParamsBacking = new URLSearchParams('search=zzzz-no-match');
    const tree = render();
    const empty = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-ice-sm'),
    );
    expect(empty.length).toBeGreaterThanOrEqual(1);
    expect((empty[0].props as { children: unknown }).children).toBe('templates.gallery.noMatchSearch');
  });

  it('renders the empty-state with noMatchFilters when search is empty', () => {
    mocks.searchParamsBacking = new URLSearchParams('category=empty');
    // searchTemplates returns pool when q is '', and pool is filtered for category='empty'
    // → empty array.
    const tree = render();
    const empty = findByPredicate(
      tree,
      (el) =>
        el.type === 'p' &&
        typeof (el.props as { className?: string }).className === 'string' &&
        (el.props as { className: string }).className.includes('text-ice-sm'),
    );
    expect(empty.length).toBeGreaterThanOrEqual(1);
    expect((empty[0].props as { children: unknown }).children).toBe('templates.gallery.noMatchFilters');
  });
});

// ─── Detail panel ─────────────────────────────────────────────────────────

describe('TemplateGalleryPage — detail panel', () => {
  it('omits the detail panel when selectedTemplate is null (initial)', () => {
    const tree = render();
    const details = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateDetail',
    );
    expect(details).toHaveLength(0);
  });

  it('renders the detail panel when selectedTemplate is set (slot 0)', () => {
    // Slot 0 is `selectedTemplate`, slot 1 is `searchInput`
    mocks.stateSlots[0] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    const details = findByPredicate(
      tree,
      (el) => typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'TemplateDetail',
    );
    expect(details).toHaveLength(1);
    expect((details[0].props as { ['data-template-id']: string })['data-template-id']).toBe('tpl-a');
  });

  it('detail panel onClose is wired (callback exists on FC element)', () => {
    mocks.stateSlots[0] = { id: 'tpl-a', name: 'Tpl A', provider: 'aws' };
    const tree = render();
    // The mock-stub for TemplateDetail yields a <div data-stub="TemplateDetail">.
    // Walk into that inner div and probe for the `onClick` of the close <button>
    // it renders — that's how the source's `onClose={() => setSelectedTemplate(null)}`
    // gets wired through the mock implementation.
    const closeBtns = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'close',
    );
    expect(closeBtns.length).toBe(1);
    expect(typeof (closeBtns[0].props as { onClick: () => void }).onClick).toBe('function');

    const useBtns = findByPredicate(
      tree,
      (el) =>
        typeof (el.props as { ['data-stub']?: string })['data-stub'] === 'string' &&
        (el.props as { ['data-stub']: string })['data-stub'] === 'use',
    );
    expect(useBtns.length).toBe(1);
    expect(typeof (useBtns[0].props as { onClick: () => void }).onClick).toBe('function');
  });
});

// ─── handleUseTemplate flow ───────────────────────────────────────────────

describe('TemplateGalleryPage — handleUseTemplate', () => {
  it('full success: creates project + sets provider + fetches + updates card; navigates via navigate()', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create
      .mockResolvedValueOnce({ data: {} }) // /update (provider)
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } }) // /get
      .mockResolvedValueOnce({ data: {} }); // /cards/update
    mocks.expandComposedTemplate.mockReturnValue({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] });

    render();
    // useCallback registers handlers in a known order:
    //   index 0 = updateParams
    //   index 1 = clearFilters
    //   index 2 = handleUseTemplate
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    expect(typeof handleUseTemplate).toBe('function');

    await handleUseTemplate({
      id: 'tpl-a',
      name: 'My App',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });

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

    // dispatch was called with fetchProjectTree(orgId)
    const dispatchedTypes = mocks.dispatch.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(dispatchedTypes).toContain('projects/fetch');

    // navigate (NOT window.location.href) — see the long source comment
    expect(mocks.navigate).toHaveBeenCalledWith('/acme-co/my-app');
  });

  it('skips /update when template.provider is undefined', async () => {
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create
      .mockResolvedValueOnce({ data: { cards: [{ id: 'card-1' }] } }) // /get (always)
      .mockResolvedValueOnce({ data: {} }); // /cards/update

    render();
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-x',
      name: 'X',
      provider: undefined,
      environmentPresets: [],
    });

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
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-z',
      name: 'My Cool App',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/acme-co/my-cool-app');
  });

  it('uses bare /slug path when orgName is unset', async () => {
    mocks.selectedOrg = null;
    mocks.axios.post.mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'lone-app' } });

    render();
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-l',
      name: 'Lone',
      provider: undefined,
      environmentPresets: [],
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/lone-app');
  });

  it('returns early without navigate when /create rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.axios.post.mockRejectedValueOnce(new Error('500'));

    render();
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-fail',
      name: 'Fail',
      provider: undefined,
      environmentPresets: [],
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('continues to navigate when non-critical inner steps fail', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.axios.post
      .mockResolvedValueOnce({ data: { id: 'proj-1', slug: 'my-app' } }) // /create OK
      .mockRejectedValueOnce(new Error('flaky update')); // /update fails

    render();
    const handleUseTemplate = mocks.callbacks[2] as (t: unknown) => Promise<void>;
    await handleUseTemplate({
      id: 'tpl-r',
      name: 'R',
      provider: 'aws',
      environmentPresets: [{ region: 'us-east-1' }],
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/acme-co/my-app');
    consoleWarnSpy.mockRestore();
  });
});

// ─── clearFilters ─────────────────────────────────────────────────────────

describe('TemplateGalleryPage — clearFilters', () => {
  it('resets searchParams to {} and searchInput to ""', () => {
    mocks.searchParamsBacking = new URLSearchParams('category=ai&search=hi');
    render();
    // index 1 = clearFilters (after updateParams at index 0)
    const clearFilters = mocks.callbacks[1] as () => void;
    clearFilters();
    expect(mocks.setSearchParams).toHaveBeenCalledWith({}, { replace: true });
  });
});

// ─── updateParams ─────────────────────────────────────────────────────────

describe('TemplateGalleryPage — updateParams', () => {
  it('sets non-"all" values into URLSearchParams', () => {
    render();
    const updateParams = mocks.callbacks[0] as (u: Record<string, string>) => void;
    updateParams({ category: 'ai' });
    expect(mocks.setSearchParams).toHaveBeenCalledTimes(1);
    // setSearchParams takes a function transformer; invoke it with current params
    const transformer = mocks.setSearchParams.mock.calls[0][0] as (prev: URLSearchParams) => URLSearchParams;
    const next = transformer(new URLSearchParams());
    expect(next.get('category')).toBe('ai');
  });

  it('deletes a param when the value is "all"', () => {
    render();
    const updateParams = mocks.callbacks[0] as (u: Record<string, string>) => void;
    updateParams({ category: 'all' });
    const transformer = mocks.setSearchParams.mock.calls[0][0] as (prev: URLSearchParams) => URLSearchParams;
    const prev = new URLSearchParams('category=ai');
    const next = transformer(prev);
    expect(next.get('category')).toBeNull();
  });

  it('deletes a param when the value is empty string', () => {
    render();
    const updateParams = mocks.callbacks[0] as (u: Record<string, string>) => void;
    updateParams({ provider: '' });
    const transformer = mocks.setSearchParams.mock.calls[0][0] as (prev: URLSearchParams) => URLSearchParams;
    const prev = new URLSearchParams('provider=aws');
    const next = transformer(prev);
    expect(next.get('provider')).toBeNull();
  });
});

// ─── Effects ──────────────────────────────────────────────────────────────

describe('TemplateGalleryPage — effects', () => {
  it('registers two useEffects (URL→input sync + debounced input→URL sync)', () => {
    render();
    expect(mocks.effects.length).toBeGreaterThanOrEqual(2);
  });

  it('first effect syncs searchParam → searchInput slot', () => {
    mocks.searchParamsBacking = new URLSearchParams('search=hello');
    render();
    // searchInput is slot 1
    mocks.effects[0].cb();
    expect(mocks.stateSlots[1]).toBe('hello');
  });

  it('second effect debounces the input → URL update via setTimeout', () => {
    vi.useFakeTimers();
    render();
    // run effect 1 (the debounce)
    const cleanup = mocks.effects[1].cb() as (() => void) | undefined;
    // Should NOT have called setSearchParams yet
    expect(mocks.setSearchParams).not.toHaveBeenCalled();
    // Advance past the 300ms debounce
    vi.advanceTimersByTime(300);
    expect(mocks.setSearchParams).toHaveBeenCalledTimes(1);
    if (typeof cleanup === 'function') cleanup();
    vi.useRealTimers();
  });
});
