/**
 * Tests for `Breadcrumbs` — direct-FC tree-walker.
 *
 * Mocks `useLocation`, `useSelector`, `useResolvePath`, and `Link` so
 * the component renders deterministically. The component handles three
 * branches:
 *   1. Top-level routes (`/settings`, `/team`) → uses TOP_ROUTES table.
 *   2. Resolved breadcrumbs from `useResolvePath`.
 *   3. Fallback URL-segment breadcrumbs when resolver hasn't loaded.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/' as string,
  state: {} as Record<string, unknown>,
  resolved: {
    loading: false,
    breadcrumbs: [] as Array<{ label: string; path: string }>,
    orgPrefix: '/',
  },
}));

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
  Link: vi.fn((props: { to: string; children?: React.ReactNode; className?: string }) =>
    React.createElement('a', { href: props.to, className: props.className }, props.children),
  ),
}));

vi.mock('../../hooks/use-resolve-path', () => ({
  useResolvePath: () => mocks.resolved,
}));

import { Breadcrumbs } from '../breadcrumbs';

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
    try {
      const FC = node.type as (p: unknown) => unknown;
      yield* walk(FC(node.props));
    } catch {
      /* opaque */
    }
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

function collectText(tree: unknown): string {
  let s = '';
  for (const el of walk(tree)) {
    const c = el.props.children;
    if (typeof c === 'string') s += c;
    else if (typeof c === 'number') s += String(c);
    else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') s += item;
        else if (typeof item === 'number') s += String(item);
      }
    }
  }
  return s;
}

const renderBC = (): React.ReactElement =>
  (Breadcrumbs as unknown as () => React.ReactElement)();

beforeEach(() => {
  mocks.pathname = '/';
  mocks.state = {};
  mocks.resolved = {
    loading: false,
    breadcrumbs: [],
    orgPrefix: '/',
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Breadcrumbs — root', () => {
  it('renders only the home link when path is "/"', () => {
    const tree = renderBC();
    const links = findAll(tree, (el) => el.type === 'a');
    expect(links).toHaveLength(1);
    expect((links[0].props as { href: string }).href).toBe('/');
  });

  it('renders the home link with the orgPrefix when set', () => {
    mocks.resolved.orgPrefix = '/orgs/acme';
    const tree = renderBC();
    const links = findAll(tree, (el) => el.type === 'a');
    expect((links[0].props as { href: string }).href).toBe('/orgs/acme');
  });

  it('falls back to "/" when resolved.orgPrefix is the empty string', () => {
    mocks.resolved.orgPrefix = '';
    const tree = renderBC();
    const links = findAll(tree, (el) => el.type === 'a');
    expect((links[0].props as { href: string }).href).toBe('/');
  });
});

describe('Breadcrumbs — top-level routes', () => {
  it('renders Settings as the only crumb for /settings', () => {
    mocks.pathname = '/settings';
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).toContain('Settings');
  });

  it('renders Team for /team', () => {
    mocks.pathname = '/team';
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).toContain('Team');
  });

  it('does NOT use top-route table for nested /settings/foo', () => {
    mocks.pathname = '/settings/foo';
    mocks.resolved.breadcrumbs = [];
    const tree = renderBC();
    const text = collectText(tree);
    // With no resolved breadcrumbs and no selected org, falls back to URL
    // segments → "Settings" + "Foo".
    expect(text).toContain('Settings');
    expect(text).toContain('Foo');
  });
});

describe('Breadcrumbs — resolved breadcrumbs', () => {
  it('renders the resolved chain from useResolvePath when available', () => {
    mocks.pathname = '/folder/proj/deploy';
    mocks.resolved.breadcrumbs = [
      { label: 'My Folder', path: '/folder' },
      { label: 'Proj', path: '/folder/proj' },
      { label: 'Deploy', path: '/folder/proj/deploy' },
    ];
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).toContain('My Folder');
    expect(text).toContain('Proj');
    expect(text).toContain('Deploy');
  });

  it('renders the last crumb as a span (not a link)', () => {
    mocks.pathname = '/folder/proj';
    mocks.resolved.breadcrumbs = [
      { label: 'My Folder', path: '/folder' },
      { label: 'Last Crumb', path: '/folder/proj' },
    ];
    const tree = renderBC();
    const lastCrumb = findFirst(
      tree,
      (el) =>
        el.type === 'span' &&
        (el.props as { children?: unknown }).children === 'Last Crumb',
    );
    expect(lastCrumb).toBeDefined();
  });

  it('renders intermediate crumbs as links', () => {
    mocks.pathname = '/folder/proj';
    mocks.resolved.breadcrumbs = [
      { label: 'Intermediate', path: '/folder' },
      { label: 'Last', path: '/folder/proj' },
    ];
    const tree = renderBC();
    const intermediateLink = findFirst(
      tree,
      (el) =>
        el.type === 'a' &&
        (el.props as { href?: string }).href === '/folder',
    );
    expect(intermediateLink).toBeDefined();
  });
});

describe('Breadcrumbs — URL fallback', () => {
  it('builds crumbs from URL segments when not loading and no resolved breadcrumbs', () => {
    mocks.pathname = '/my-folder/some-project';
    mocks.resolved.loading = false;
    mocks.resolved.breadcrumbs = [];
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).toContain('My Folder');
    expect(text).toContain('Some Project');
  });

  it('skips org slug (first segment) when selectedOrg is set', () => {
    mocks.pathname = '/acme/proj-x';
    mocks.state = { account: { selectedOrg: { slug: 'acme' } } };
    mocks.resolved.loading = false;
    mocks.resolved.breadcrumbs = [];
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).toContain('Proj X');
    expect(text).not.toContain('Acme');
  });

  it('does not render fallback crumbs when resolver is loading', () => {
    mocks.pathname = '/folder';
    mocks.resolved.loading = true;
    mocks.resolved.breadcrumbs = [];
    const tree = renderBC();
    const text = collectText(tree);
    expect(text).not.toContain('Folder');
  });

  it('builds path strings prefixed with /', () => {
    mocks.pathname = '/folder/proj';
    mocks.resolved.loading = false;
    mocks.resolved.breadcrumbs = [];
    const tree = renderBC();
    const links = findAll(tree, (el) => el.type === 'a');
    // index 0 home link, index 1 first crumb /folder, last is plain span.
    expect((links[1].props as { href: string }).href).toBe('/folder');
  });
});
