/**
 * rf-pdpl-8 — AuthBanner.
 *
 * Third Layer 1 leaf-component extraction in rf-pdpl. The component takes
 * no props and renders a static orange-tinted banner with a spinning
 * `Loader2` icon and two translated strings. Direct-FC tree-walker pattern
 * (cite `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`):
 * `Loader2` is mocked to a text-stub `<span>`, but the walker invokes any
 * non-mocked function `el.type` it encounters and yields from the rendered
 * subtree (here only the icon stub itself; AuthBanner has no inner FCs).
 *
 * `useTranslation` mocked so `t(key) => key` — label assertions become
 * exact string matches against the two translation keys
 * `'deploy.auth.connecting'` and `'deploy.auth.browserPrompt'`.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Hoist the icon mock for stable identity across the file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`). The
// stub is invoked during the FC walk and renders a recognizable `<span>` so
// `expect(text).toContain('Loader2')` can hit it. Crucially, the stub
// preserves the `className` prop so we can assert on `animate-spin` etc.
const mocks = vi.hoisted(() => ({
  Loader2: vi.fn((props: { className?: string }) =>
    React.createElement(
      'span',
      { 'data-icon': 'Loader2', className: props.className },
      'Loader2',
    ),
  ),
}));

vi.mock('lucide-react', () => ({
  Loader2: mocks.Loader2,
}));

// `useTranslation` mock — identity `t(key) => key` for exact-string assertions.
vi.mock('../../../../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { AuthBanner } from '../auth-banner';

// ─── Tree-walker (rf-pdpl-7 style) ──────────────────────────────────────────
//
// Walks the React element tree, INVOKING any function `el.type` it
// encounters (mocked icons and any file-private FCs) so their rendered
// subtree is visible to the predicate / collectText helpers.

type ReactNodeLike = React.ReactNode;

function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return;
  }
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as ReactNodeLike);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  if (typeof el.type === 'function') {
    const FC = el.type as (props: unknown) => React.ReactNode;
    const rendered = FC(el.props);
    yield* walk(rendered as ReactNodeLike);
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

function collectText(tree: React.ReactNode): string {
  const parts: string[] = [];
  function visit(n: ReactNodeLike): void {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string') {
      parts.push(n);
      return;
    }
    if (typeof n === 'number') {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      for (const c of n) visit(c as ReactNodeLike);
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      const FC = el.type as (props: unknown) => React.ReactNode;
      visit(FC(el.props) as ReactNodeLike);
      return;
    }
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    if (children != null) visit(children);
  }
  visit(tree);
  return parts.join('');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const renderBanner = (): React.ReactElement =>
  (AuthBanner as unknown as () => React.ReactElement)();

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AuthBanner — outer container', () => {
  it('returns a single root <div> with the orange banner color classes', () => {
    const tree = renderBanner();
    expect(tree.type).toBe('div');
    const className = (tree.props as { className: string }).className;
    expect(className).toContain('rounded-md');
    expect(className).toContain('border');
    expect(className).toContain('border-orange-200');
    expect(className).toContain('dark:border-orange-800');
    expect(className).toContain('bg-orange-50');
    expect(className).toContain('dark:bg-orange-900/20');
    expect(className).toContain('p-4');
    expect(className).toContain('text-sm');
  });
});

describe('AuthBanner — inner row (icon + connecting label)', () => {
  it('renders the inner flex row with the orange-700/-300 color classes', () => {
    const tree = renderBanner();
    const rows = findByPredicate(tree, (el) => {
      if (el.type !== 'div') return false;
      const cn = (el.props as { className?: string }).className;
      return (
        typeof cn === 'string' &&
        cn.includes('flex') &&
        cn.includes('items-center') &&
        cn.includes('gap-2.5') &&
        cn.includes('text-orange-700')
      );
    });
    expect(rows).toHaveLength(1);
    const cn = (rows[0].props as { className: string }).className;
    expect(cn).toContain('dark:text-orange-300');
  });

  it('renders the Loader2 icon with the spinning className', () => {
    const tree = renderBanner();
    // Mocked Loader2 renders <span data-icon="Loader2" className="...">.
    const icons = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const props = el.props as { 'data-icon'?: string; className?: string };
      return props['data-icon'] === 'Loader2';
    });
    expect(icons).toHaveLength(1);
    const iconCn = (icons[0].props as { className: string }).className;
    expect(iconCn).toContain('w-4');
    expect(iconCn).toContain('h-4');
    expect(iconCn).toContain('animate-spin');
  });

  it('renders the connecting <span> with the medium-weight font and the translation key text', () => {
    const tree = renderBanner();
    const spans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('font-medium');
    });
    expect(spans).toHaveLength(1);
    // The span's child is the result of `t('deploy.auth.connecting')` — under
    // the identity mock that's the key itself.
    const text = collectText(spans[0]);
    expect(text).toBe('deploy.auth.connecting');
  });
});

describe('AuthBanner — browser-prompt paragraph', () => {
  it('renders a <p> with the orange-600/-400 + xs text classes and the prompt translation key', () => {
    const tree = renderBanner();
    const ps = findByPredicate(tree, (el) => el.type === 'p');
    expect(ps).toHaveLength(1);
    const cn = (ps[0].props as { className: string }).className;
    expect(cn).toContain('mt-2');
    expect(cn).toContain('text-orange-600');
    expect(cn).toContain('dark:text-orange-400');
    expect(cn).toContain('text-xs');
    const text = collectText(ps[0]);
    expect(text).toBe('deploy.auth.browserPrompt');
  });
});

describe('AuthBanner — translation keys (text-only sweep)', () => {
  it('renders both expected translation keys verbatim under the identity t() mock', () => {
    const tree = renderBanner();
    const text = collectText(tree);
    expect(text).toContain('deploy.auth.connecting');
    expect(text).toContain('deploy.auth.browserPrompt');
    // Loader2 stub text is also visible via the walker.
    expect(text).toContain('Loader2');
  });

  it('renders no other translation keys (the banner is static — no other t() calls)', () => {
    const tree = renderBanner();
    // Walk the tree and collect the literal child of every <span>/<p> leaf
    // (the t() result strings). `collectText` joins all text — the two key
    // strings end up adjacent (`...connectingdeploy.auth.browserPrompt`),
    // which would defeat a regex sweep. Per-leaf collection avoids the join.
    const leafTexts: string[] = [];
    for (const el of walk(tree)) {
      if (el.type !== 'span' && el.type !== 'p') continue;
      const child = (el.props as { children?: React.ReactNode }).children;
      if (typeof child === 'string') leafTexts.push(child);
    }
    // Keep only strings that look like translation keys (`deploy.auth.*`).
    // The Loader2 stub renders `'Loader2'` as a span child, so we filter.
    const authKeys = leafTexts.filter((s) => s.startsWith('deploy.auth.'));
    expect(new Set(authKeys)).toEqual(
      new Set(['deploy.auth.connecting', 'deploy.auth.browserPrompt']),
    );
  });
});
