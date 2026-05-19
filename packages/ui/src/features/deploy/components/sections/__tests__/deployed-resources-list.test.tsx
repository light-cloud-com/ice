/**
 * rf-pdpl-9 — DeployedResourcesList.
 *
 * Fourth Layer 1 leaf-component extraction in rf-pdpl. Direct-FC tree-walker
 * pattern (cite `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`):
 * `CheckCircle` is mocked to a text-stub `<span>`, but the walker invokes
 * any non-mocked function `el.type` it encounters and yields from the
 * rendered subtree. DeployedResourcesList itself contains no inner FCs, so
 * the walker only descends into the lucide stub.
 *
 * No `useTranslation` mock here — the brief notes the two literal strings
 * `'deployed resource'` and `'(from prior deploy)'` are NOT in the i18n
 * catalog and stay verbatim. Tests assert against those literal English
 * strings.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// Hoist the icon mock for stable identity across the file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`). The
// stub is invoked during the FC walk and renders a recognizable `<span>` so
// `expect(text).toContain('CheckCircle')` can hit it. Crucially, the stub
// preserves the `className` prop so we can assert on the size + color tokens.
const mocks = vi.hoisted(() => ({
  CheckCircle: vi.fn((props: { className?: string }) =>
    React.createElement(
      'span',
      { 'data-icon': 'CheckCircle', className: props.className },
      'CheckCircle',
    ),
  ),
}));

vi.mock('lucide-react', () => ({
  CheckCircle: mocks.CheckCircle,
}));

import { DeployedResourcesList } from '../deployed-resources-list';

// ─── Tree-walker (rf-pdpl-7/-8 style) ───────────────────────────────────────
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

type Resource = { name: string; type: string; provider_id?: string };

const renderList = (resources: Resource[]): React.ReactElement =>
  (DeployedResourcesList as unknown as (props: { resources: Resource[] }) => React.ReactElement)({
    resources,
  });

// Pull the header <div> (the "{n} deployed resource(s) (from prior deploy)" row).
const findHeader = (tree: React.ReactNode): React.ReactElement => {
  const headers = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    return (
      typeof cn === 'string' &&
      cn.includes('px-4') &&
      cn.includes('py-2') &&
      cn.includes('bg-muted/40') &&
      cn.includes('border-b')
    );
  });
  expect(headers).toHaveLength(1);
  return headers[0];
};

// Pull the body <div> (the `divide-y` scroll container) and return its
// per-resource <div> rows from the `children` array.
const findRowDivs = (tree: React.ReactNode): React.ReactElement[] => {
  const bodies = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    return (
      typeof cn === 'string' &&
      cn.includes('divide-y') &&
      cn.includes('max-h-32') &&
      cn.includes('overflow-y-auto')
    );
  });
  expect(bodies).toHaveLength(1);
  // The body's `children` is the result of `resources.map(...)` — an array
  // of <div> elements (or empty array if no resources). React's child shape
  // is the array directly, not wrapped in fragments.
  const children = (bodies[0].props as { children?: React.ReactNode }).children;
  if (children == null) return [];
  if (!Array.isArray(children)) {
    return [children as React.ReactElement];
  }
  return (children as React.ReactNode[]).filter(
    (c): c is React.ReactElement =>
      c != null && typeof c === 'object' && (c as React.ReactElement).type === 'div',
  );
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeployedResourcesList — outer container', () => {
  it('returns a single root <div> with the bordered, rounded, overflow-hidden classes', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    expect(tree.type).toBe('div');
    const className = (tree.props as { className: string }).className;
    expect(className).toContain('rounded-md');
    expect(className).toContain('border');
    expect(className).toContain('border-border');
    expect(className).toContain('overflow-hidden');
  });
});

describe('DeployedResourcesList — header row', () => {
  it('renders the muted header row with the icon, count, and "(from prior deploy)" suffix', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    const header = findHeader(tree);
    const cn = (header.props as { className: string }).className;
    expect(cn).toContain('text-sm');
    expect(cn).toContain('font-medium');
    expect(cn).toContain('flex');
    expect(cn).toContain('items-center');
    expect(cn).toContain('gap-2');
    // The text should mention the deployed-resource phrase + suffix.
    const text = collectText(header);
    expect(text).toContain('deployed resource');
    expect(text).toContain('(from prior deploy)');
  });

  it('renders the CheckCircle icon with the small blue size+color tokens', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    const icons = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const props = el.props as { 'data-icon'?: string };
      return props['data-icon'] === 'CheckCircle';
    });
    expect(icons).toHaveLength(1);
    const iconCn = (icons[0].props as { className: string }).className;
    expect(iconCn).toContain('w-3.5');
    expect(iconCn).toContain('h-3.5');
    expect(iconCn).toContain('text-blue-500');
  });

  it('renders the singular "deployed resource (from prior deploy)" text when length === 1', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    const header = findHeader(tree);
    const text = collectText(header);
    // The header concatenates: "1 deployed resource (from prior deploy)" with
    // a leading icon stub. collectText prepends "CheckCircle" before the count.
    expect(text).toContain('1 deployed resource (from prior deploy)');
    // No trailing 's' on "resource".
    expect(text).not.toContain('1 deployed resources');
  });

  it('renders the plural "deployed resources (from prior deploy)" text when length === 2', () => {
    const tree = renderList([
      { name: 'a', type: 't' },
      { name: 'b', type: 'u' },
    ]);
    const header = findHeader(tree);
    const text = collectText(header);
    expect(text).toContain('2 deployed resources (from prior deploy)');
  });

  it('renders the plural form when length === 0 (orchestrator gates this; component does not early-return)', () => {
    // Defensive: the component itself has no early-return on empty. With
    // length === 0 the header's `length !== 1` ternary fires the plural 's'.
    const tree = renderList([]);
    const header = findHeader(tree);
    const text = collectText(header);
    // "0 deployed resources (from prior deploy)" — 0 !== 1 so plural.
    expect(text).toContain('0 deployed resources (from prior deploy)');
  });

  it('renders the plural form when length === 5 (any count !== 1)', () => {
    const tree = renderList([
      { name: 'a', type: 't' },
      { name: 'b', type: 'u' },
      { name: 'c', type: 'v' },
      { name: 'd', type: 'w' },
      { name: 'e', type: 'x' },
    ]);
    const header = findHeader(tree);
    const text = collectText(header);
    expect(text).toContain('5 deployed resources (from prior deploy)');
  });
});

describe('DeployedResourcesList — body rows', () => {
  it('renders an empty body container with no row <div>s when resources is empty', () => {
    const tree = renderList([]);
    const rows = findRowDivs(tree);
    expect(rows).toHaveLength(0);
  });

  it('renders a single row <div> for one resource, with the row-row classes', () => {
    const tree = renderList([{ name: 'web', type: 'cloud-run.service' }]);
    const rows = findRowDivs(tree);
    expect(rows).toHaveLength(1);
    const rowCn = (rows[0].props as { className: string }).className;
    expect(rowCn).toContain('px-4');
    expect(rowCn).toContain('py-1.5');
    expect(rowCn).toContain('text-xs');
    expect(rowCn).toContain('flex');
    expect(rowCn).toContain('items-center');
    expect(rowCn).toContain('gap-2');
  });

  it('renders the resource name in a <span> with font-medium + text-sm classes', () => {
    const tree = renderList([{ name: 'my-service', type: 'cloud-run.service' }]);
    const rows = findRowDivs(tree);
    const nameSpans = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return (
        typeof cn === 'string' &&
        cn.includes('font-medium') &&
        cn.includes('text-sm') &&
        // Exclude the right-side provider_id span (which has font-mono).
        !cn.includes('font-mono')
      );
    });
    expect(nameSpans).toHaveLength(1);
    expect((nameSpans[0].props as { children: string }).children).toBe('my-service');
  });

  it('renders the resource type in a <span> with muted + font-mono classes', () => {
    const tree = renderList([{ name: 'my-service', type: 'cloud-run.service' }]);
    const rows = findRowDivs(tree);
    const typeSpans = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return (
        typeof cn === 'string' &&
        cn.includes('text-muted-foreground') &&
        cn.includes('font-mono') &&
        // Exclude the right-side provider_id span (which has ml-auto + truncate).
        !cn.includes('ml-auto') &&
        !cn.includes('truncate')
      );
    });
    expect(typeSpans).toHaveLength(1);
    expect((typeSpans[0].props as { children: string }).children).toBe('cloud-run.service');
  });

  it('renders the provider_id <span> on the right with ml-auto + truncate classes when provider_id is present', () => {
    const tree = renderList([
      {
        name: 'my-service',
        type: 'cloud-run.service',
        provider_id: 'projects/foo/locations/us-central1/services/my-service',
      },
    ]);
    const rows = findRowDivs(tree);
    const providerSpans = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return (
        typeof cn === 'string' &&
        cn.includes('ml-auto') &&
        cn.includes('truncate') &&
        cn.includes('max-w-[250px]')
      );
    });
    expect(providerSpans).toHaveLength(1);
    const props = providerSpans[0].props as {
      title: string;
      className: string;
      children: string;
    };
    expect(props.className).toContain('text-muted-foreground');
    expect(props.className).toContain('font-mono');
    expect(props.title).toBe('projects/foo/locations/us-central1/services/my-service');
    expect(props.children).toBe('projects/foo/locations/us-central1/services/my-service');
  });

  it('renders no provider_id <span> when provider_id is absent', () => {
    const tree = renderList([{ name: 'my-service', type: 'cloud-run.service' }]);
    const rows = findRowDivs(tree);
    const providerSpans = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(providerSpans).toHaveLength(0);
  });

  it('renders no provider_id <span> when provider_id is the empty string (falsy)', () => {
    // The original used `{r.provider_id && (...)}` truthiness — empty string
    // is falsy, so even a present-but-empty provider_id should NOT render
    // the right-side span. Lock that branch.
    const tree = renderList([
      { name: 'my-service', type: 'cloud-run.service', provider_id: '' },
    ]);
    const rows = findRowDivs(tree);
    const providerSpans = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(providerSpans).toHaveLength(0);
  });

  it('renders mixed provider_id presence — first row has it, second row does not', () => {
    const tree = renderList([
      { name: 'a', type: 'ta', provider_id: 'pid-a' },
      { name: 'b', type: 'tb' },
    ]);
    const rows = findRowDivs(tree);
    expect(rows).toHaveLength(2);

    const firstRowProvider = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(firstRowProvider).toHaveLength(1);
    expect((firstRowProvider[0].props as { children: string }).children).toBe('pid-a');

    const secondRowProvider = findByPredicate(rows[1], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(secondRowProvider).toHaveLength(0);
  });

  it('renders mixed provider_id presence — first row missing, second row has it', () => {
    // Symmetric to the previous case to lock both branches of the truthy check.
    const tree = renderList([
      { name: 'a', type: 'ta' },
      { name: 'b', type: 'tb', provider_id: 'pid-b' },
    ]);
    const rows = findRowDivs(tree);
    expect(rows).toHaveLength(2);

    const firstRowProvider = findByPredicate(rows[0], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(firstRowProvider).toHaveLength(0);

    const secondRowProvider = findByPredicate(rows[1], (el) => {
      if (el.type !== 'span') return false;
      const cn = (el.props as { className?: string }).className;
      return typeof cn === 'string' && cn.includes('ml-auto');
    });
    expect(secondRowProvider).toHaveLength(1);
    expect((secondRowProvider[0].props as { children: string }).children).toBe('pid-b');
  });
});

describe('DeployedResourcesList — row keys (array index)', () => {
  it('uses the array index as the row key (`key={0}`, `key={1}`, ...)', () => {
    // The original code passes `key={i}` — preserve that. React stores `key`
    // on the ReactElement directly (not in props), so we read it via
    // `el.key`. The rendered key is coerced to a string by React.
    const tree = renderList([
      { name: 'a', type: 'ta' },
      { name: 'b', type: 'tb' },
      { name: 'c', type: 'tc' },
    ]);
    const rows = findRowDivs(tree);
    expect(rows).toHaveLength(3);
    expect(rows[0].key).toBe('0');
    expect(rows[1].key).toBe('1');
    expect(rows[2].key).toBe('2');
  });
});

describe('DeployedResourcesList — verbatim English strings (not in i18n catalog)', () => {
  it('renders the literal "(from prior deploy)" suffix verbatim (not a translation key)', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    const text = collectText(tree);
    expect(text).toContain('(from prior deploy)');
    // No translation-key shape (`deploy.foo.bar`).
    expect(text).not.toMatch(/deploy\.[a-zA-Z]+\.[a-zA-Z]+/);
  });

  it('renders the literal "deployed resource" / "deployed resources" stem verbatim', () => {
    const tree = renderList([{ name: 'a', type: 't' }]);
    const text = collectText(tree);
    expect(text).toContain('deployed resource');
  });
});
