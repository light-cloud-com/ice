/**
 * rf-pdpl-11 — DnsRecordsSection.
 *
 * Sixth Layer 1 leaf-component extraction in rf-pdpl. Direct-FC tree-walker
 * pattern (cite `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`,
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * DnsRecordsSection has no inner FCs (`renderRecord` and `renderHeader` are
 * file-private helper functions returning JSX, NOT components — they're called
 * directly inside `.map(...)` and the FC body, so the elements they produce
 * are inlined into the tree without an FC indirection). The walker only needs
 * the array-flatten + element-recursion branches. No `lucide-react` or
 * `useTranslation` mocks required.
 *
 * Hardcoded English strings stay verbatim (NOT in i18n catalog):
 *   "DNS records for", "Add the records below at your DNS provider to verify
 *   that you own", "Remove the records below from your DNS provider — they
 *   conflict with the new configuration and block verification", "Type",
 *   "Domain name", "Value", "Copy", "Copy value to clipboard". The em-dash
 *   in the Remove instruction is U+2014 (preserved byte-identical).
 *
 * Clipboard testing: the Copy button calls
 * `navigator.clipboard.writeText(rec.value).catch(() => undefined)`. We stub
 * the global `navigator` with a hoisted spy so the click can be invoked
 * synthetically and asserted on. The `.catch(() => undefined)` swallows
 * rejections — we exercise that branch by returning a rejected promise from
 * the spy and asserting that no exception escapes the click invocation.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist the clipboard spy for stable identity across the file (cite
// `vi-hoisted-for-stable-mock-identity-in-direct-fc-tree-walker-tests`).
// Each test mutates `mocks.writeTextResult` to control resolve vs. reject.
const mocks = vi.hoisted(() => ({
  writeTextResult: { mode: 'resolve' as 'resolve' | 'reject' },
  writeText: vi.fn((_value: string): Promise<void> => Promise.resolve()),
}));

// Re-bind the spy each test so its return value matches the current mode.
beforeEach(() => {
  mocks.writeText.mockReset();
  mocks.writeText.mockImplementation((_value: string) =>
    mocks.writeTextResult.mode === 'resolve' ? Promise.resolve() : Promise.reject(new Error('denied')),
  );
  mocks.writeTextResult.mode = 'resolve';
});

vi.stubGlobal('navigator', { clipboard: { writeText: mocks.writeText } });

import { DnsRecordsSection } from '../dns-records-section';
import type { DeployResourceResult } from '../../../../../store/slices/deploy-slice';

// ─── Tree-walker (rf-pdpl-7/-8/-9/-10 style) ────────────────────────────────
//
// Walks the React element tree, INVOKING any function `el.type` it encounters
// (no inner FCs in this module — `renderRecord` and `renderHeader` are plain
// functions called inline in `.map(...)`, so their JSX is already inlined in
// the children array). The walker still needs the array-flatten branch
// because `dnsResults.map(...)` produces a child array, and the inner
// `addRecords.map(...)` / `removeRecords.map(...)` produce nested arrays
// inside the per-record block.

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
    const FC = el.type as (props: unknown) => React.ReactNode;
    const rendered = FC(el.props);
    yield* walk(rendered as ReactNodeLike);
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

const renderSection = (results: DeployResourceResult[]): React.ReactElement | null =>
  (DnsRecordsSection as unknown as (props: { results: DeployResourceResult[] }) => React.ReactElement | null)({
    results,
  });

// Make a successful Firebase Hosting–shaped result with the given DNS records.
const makeResult = (
  overrides: Partial<DeployResourceResult> & {
    custom_domain?: string;
    custom_domain_dns_records?: Array<{
      type: string;
      domain: string;
      value: string;
      required_action?: string;
    }>;
  } = {},
): DeployResourceResult => {
  const { custom_domain, custom_domain_dns_records, ...rest } = overrides;
  const outputs: Record<string, unknown> = {};
  if (custom_domain !== undefined) outputs.custom_domain = custom_domain;
  if (custom_domain_dns_records !== undefined) {
    outputs.custom_domain_dns_records = custom_domain_dns_records;
  }
  return {
    name: 'web',
    type: 'firebase-hosting.site',
    action: 'create',
    success: true,
    outputs,
    ...rest,
  };
};

// Find every "DNS records for {customDomain}" header span, in tree order.
const findDomainHeaders = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return cn.includes('font-medium') && cn.includes('text-blue-700') && cn.includes('dark:text-blue-300');
  });

// Find the outer `.space-y-2` container.
const findOuter = (tree: React.ReactNode): React.ReactElement => {
  const found = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    return cn === 'space-y-2';
  });
  expect(found).toHaveLength(1);
  return found[0];
};

// Find the per-result outer card divs (the `.rounded-md.border-blue-500/30…` wrappers).
const findResultCards = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return cn.includes('rounded-md') && cn.includes('border-blue-500/30') && cn.includes('bg-blue-50');
  });

// Find the add-records subheader (blue palette, "Add the records below…").
const findAddSubheader = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return (
      cn.includes('text-[11px]') &&
      cn.includes('font-medium') &&
      cn.includes('text-blue-700') &&
      cn.includes('dark:text-blue-300')
    );
  });

// Find the remove-records subheader (amber palette, "Remove the records below…").
const findRemoveSubheader = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return (
      cn.includes('text-[11px]') &&
      cn.includes('font-medium') &&
      cn.includes('text-amber-700') &&
      cn.includes('dark:text-amber-300')
    );
  });

// Find every DNS record row (the inner `.flex.items-center.gap-2.text-xs.font-mono…` wrapper).
const findRecordRows = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return (
      cn.includes('flex') &&
      cn.includes('items-center') &&
      cn.includes('gap-2') &&
      cn.includes('text-xs') &&
      cn.includes('font-mono') &&
      cn.includes('px-2') &&
      cn.includes('py-1.5') &&
      cn.includes('rounded')
    );
  });

// Find every "Copy" button.
const findCopyButtons = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'button') return false;
    const props = el.props as { title?: string; children?: React.ReactNode };
    return props.title === 'Copy value to clipboard';
  });

// Find every column-header bar (the `.text-[10px].font-mono.uppercase…` div).
const findColumnHeaders = (tree: React.ReactNode): React.ReactElement[] =>
  findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const cn = (el.props as { className?: string }).className;
    if (typeof cn !== 'string') return false;
    return (
      cn.includes('text-[10px]') &&
      cn.includes('font-mono') &&
      cn.includes('uppercase') &&
      cn.includes('tracking-wider') &&
      cn.includes('text-muted-foreground') &&
      cn.includes('px-2') &&
      cn.includes('pb-1')
    );
  });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DnsRecordsSection — early-return on empty input', () => {
  it('returns null when results is empty', () => {
    const tree = renderSection([]);
    expect(tree).toBeNull();
  });

  it('returns null when no result has DNS records (extractDnsResults filters all)', () => {
    // No `custom_domain_dns_records` key on outputs at all → filter drops it.
    const tree = renderSection([makeResult({ name: 'web' })]);
    expect(tree).toBeNull();
  });

  it('returns null when a result has DNS records but the result itself failed', () => {
    // success: false → extractDnsResults filters out.
    const tree = renderSection([
      makeResult({
        success: false,
        custom_domain_dns_records: [{ type: 'A', domain: 'x.com', value: '1.2.3.4' }],
      }),
    ]);
    expect(tree).toBeNull();
  });

  it('returns null when DNS records key is present but the array is empty', () => {
    const tree = renderSection([makeResult({ custom_domain_dns_records: [] })]);
    expect(tree).toBeNull();
  });
});

describe('DnsRecordsSection — outer structure', () => {
  it('returns a single root <div> with className="space-y-2"', () => {
    const tree = renderSection([
      makeResult({
        custom_domain: 'example.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    expect(tree).not.toBeNull();
    const outer = tree as React.ReactElement;
    expect(outer.type).toBe('div');
    expect((outer.props as { className: string }).className).toBe('space-y-2');
  });

  it('renders one outer card per result with the verbatim blue-palette card classes', () => {
    const tree = renderSection([
      makeResult({
        name: 'a',
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
    ]);
    const cards = findResultCards(tree);
    expect(cards).toHaveLength(1);
    const cn = (cards[0].props as { className: string }).className;
    // Lock the entire card-class string verbatim — it carries the blue palette
    // and the inner spacing.
    expect(cn).toBe('rounded-md border border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-3');
  });

  it('uses `${r.name}-${idx}` as the per-card key', () => {
    const tree = renderSection([
      makeResult({
        name: 'web-a',
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
      makeResult({
        name: 'web-b',
        custom_domain_dns_records: [{ type: 'A', domain: 'b.com', value: '2.2.2.2' }],
      }),
    ]);
    const cards = findResultCards(tree);
    expect(cards).toHaveLength(2);
    expect(cards[0].key).toBe('web-a-0');
    expect(cards[1].key).toBe('web-b-1');
  });
});

describe('DnsRecordsSection — header subject (custom_domain vs r.name fallback)', () => {
  it('uses outputs.custom_domain when set', () => {
    const tree = renderSection([
      makeResult({
        name: 'fallback-name',
        custom_domain: 'example.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const headers = findDomainHeaders(tree);
    expect(headers).toHaveLength(1);
    // The header's children is the literal "DNS records for " plus the
    // computed customDomain interpolation.
    const text = collectText(headers[0]);
    expect(text).toBe('DNS records for example.com');
  });

  it('falls back to r.name when outputs.custom_domain is not set', () => {
    const tree = renderSection([
      makeResult({
        name: 'fallback-name',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const headers = findDomainHeaders(tree);
    expect(headers).toHaveLength(1);
    expect(collectText(headers[0])).toBe('DNS records for fallback-name');
  });

  it('falls back to r.name when outputs.custom_domain is the empty string (falsy)', () => {
    // `(r.outputs as any)?.custom_domain || r.name` — empty string is falsy,
    // so the OR falls through to r.name.
    const tree = renderSection([
      makeResult({
        name: 'fallback-name',
        custom_domain: '',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const headers = findDomainHeaders(tree);
    expect(collectText(headers[0])).toBe('DNS records for fallback-name');
  });
});

describe('DnsRecordsSection — add-records block (blue palette, required_action undefined)', () => {
  it('renders the blue-palette add-records subheader with the verbatim instruction string', () => {
    const tree = renderSection([
      makeResult({
        custom_domain: 'example.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const subheaders = findAddSubheader(tree);
    expect(subheaders).toHaveLength(1);
    const text = collectText(subheaders[0]);
    expect(text).toBe('Add the records below at your DNS provider to verify that you own example.com');
  });

  it('renders the column-header bar with "Type", "Domain name", and "Value" labels', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const colHeaders = findColumnHeaders(tree);
    expect(colHeaders).toHaveLength(1);
    // The column header has 4 spans: Type / Domain name / Value / spacer.
    const children = (colHeaders[0].props as { children: React.ReactNode[] }).children;
    expect(Array.isArray(children)).toBe(true);
    const labels = (children as React.ReactElement[]).map((el) => (el.props as { children?: string }).children ?? null);
    // The 4th span is a spacer (no children), so its label is null/undefined.
    expect(labels[0]).toBe('Type');
    expect(labels[1]).toBe('Domain name');
    expect(labels[2]).toBe('Value');
    expect(labels[3] == null).toBe(true);
  });

  it('renders one record row per add-record with the type / domain / value', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [
          { type: 'A', domain: 'example.com', value: '1.2.3.4' },
          { type: 'TXT', domain: 'example.com', value: 'firebase=abc123' },
        ],
      }),
    ]);
    const rows = findRecordRows(tree);
    expect(rows).toHaveLength(2);

    // Each row's children: [<typeSpan>, <domainSpan>, <valueSpan>, <copyButton>].
    const firstChildren = (rows[0].props as { children: React.ReactNode[] }).children;
    const [typeSpan, domainSpan, valueSpan] = firstChildren as [
      React.ReactElement,
      React.ReactElement,
      React.ReactElement,
    ];
    expect((typeSpan.props as { children: string }).children).toBe('A');
    expect((domainSpan.props as { children: string }).children).toBe('example.com');
    expect((valueSpan.props as { children: string }).children).toBe('1.2.3.4');

    const secondChildren = (rows[1].props as { children: React.ReactNode[] }).children;
    const [t2, d2, v2] = secondChildren as [React.ReactElement, React.ReactElement, React.ReactElement];
    expect((t2.props as { children: string }).children).toBe('TXT');
    expect((d2.props as { children: string }).children).toBe('example.com');
    expect((v2.props as { children: string }).children).toBe('firebase=abc123');
  });

  it('applies the blue palette to add-records rows (bg, type color, chip color)', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
    ]);
    const rows = findRecordRows(tree);
    expect(rows).toHaveLength(1);
    const rowCn = (rows[0].props as { className: string }).className;
    // Row bg is `bg-background/60`.
    expect(rowCn).toContain('bg-background/60');

    // Type span has the blue text-color.
    const children = (rows[0].props as { children: React.ReactNode[] }).children;
    const typeSpan = (children as React.ReactElement[])[0];
    const typeCn = (typeSpan.props as { className: string }).className;
    expect(typeCn).toContain('text-blue-700');
    expect(typeCn).toContain('dark:text-blue-300');

    // Copy button has the blue chip + chipHover.
    const buttons = findCopyButtons(rows[0]);
    expect(buttons).toHaveLength(1);
    const btnCn = (buttons[0].props as { className: string }).className;
    expect(btnCn).toContain('bg-blue-500/20');
    expect(btnCn).toContain('text-blue-700');
    expect(btnCn).toContain('dark:text-blue-300');
    expect(btnCn).toContain('hover:bg-blue-500/30');
  });

  it('uses ridx (the per-record index) as the row key', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [
          { type: 'A', domain: 'a.com', value: '1.1.1.1' },
          { type: 'TXT', domain: 'a.com', value: 'firebase=xyz' },
        ],
      }),
    ]);
    const rows = findRecordRows(tree);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe('0');
    expect(rows[1].key).toBe('1');
  });

  it('treats records with required_action === "add" as add-records (explicit add)', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1', required_action: 'add' }],
      }),
    ]);
    expect(findAddSubheader(tree)).toHaveLength(1);
    expect(findRemoveSubheader(tree)).toHaveLength(0);
  });

  it('treats records with an unknown required_action ("verify") as add-records', () => {
    // The OR-default in splitDnsByAction: any non-"remove" string → addRecords.
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1', required_action: 'verify' }],
      }),
    ]);
    expect(findAddSubheader(tree)).toHaveLength(1);
    expect(findRemoveSubheader(tree)).toHaveLength(0);
  });
});

describe('DnsRecordsSection — remove-records block (amber palette, required_action === "remove")', () => {
  it('renders the amber-palette remove-records subheader with the verbatim instruction string (em-dash preserved)', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'old.com', value: '9.9.9.9', required_action: 'remove' }],
      }),
    ]);
    const subheaders = findRemoveSubheader(tree);
    expect(subheaders).toHaveLength(1);
    const text = collectText(subheaders[0]);
    // The em-dash is U+2014; the instruction has a soft break between "and"
    // and "block verification" but `collectText` joins parts with no
    // separator, so the rendered text contains a space (from the JSX text
    // node) between them.
    expect(text).toBe(
      'Remove the records below from your DNS provider — they conflict with the new configuration and block verification',
    );
  });

  it('does NOT render the add subheader when only remove-records are present', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'old.com', value: '9.9.9.9', required_action: 'remove' }],
      }),
    ]);
    expect(findAddSubheader(tree)).toHaveLength(0);
  });

  it('applies the amber palette to remove-records rows (bg, type color, chip color)', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'old.com', value: '9.9.9.9', required_action: 'remove' }],
      }),
    ]);
    const rows = findRecordRows(tree);
    expect(rows).toHaveLength(1);
    const rowCn = (rows[0].props as { className: string }).className;
    // Row bg is the amber palette.
    expect(rowCn).toContain('bg-amber-50');
    expect(rowCn).toContain('dark:bg-amber-950/30');

    // Type span has the amber text-color.
    const children = (rows[0].props as { children: React.ReactNode[] }).children;
    const typeSpan = (children as React.ReactElement[])[0];
    const typeCn = (typeSpan.props as { className: string }).className;
    expect(typeCn).toContain('text-amber-700');
    expect(typeCn).toContain('dark:text-amber-300');

    // Copy button has the amber chip + chipHover.
    const buttons = findCopyButtons(rows[0]);
    expect(buttons).toHaveLength(1);
    const btnCn = (buttons[0].props as { className: string }).className;
    expect(btnCn).toContain('bg-amber-500/20');
    expect(btnCn).toContain('text-amber-700');
    expect(btnCn).toContain('dark:text-amber-300');
    expect(btnCn).toContain('hover:bg-amber-500/30');
  });
});

describe('DnsRecordsSection — both add + remove blocks rendered together', () => {
  it('renders both subheaders and both row sets when a result has mixed records', () => {
    const tree = renderSection([
      makeResult({
        custom_domain: 'example.com',
        custom_domain_dns_records: [
          { type: 'A', domain: 'example.com', value: '1.2.3.4' }, // add (no required_action)
          { type: 'A', domain: 'example.com', value: '9.9.9.9', required_action: 'remove' },
          { type: 'TXT', domain: 'example.com', value: 'firebase=abc' },
        ],
      }),
    ]);
    expect(findAddSubheader(tree)).toHaveLength(1);
    expect(findRemoveSubheader(tree)).toHaveLength(1);

    // 3 record rows total: 2 add + 1 remove.
    const rows = findRecordRows(tree);
    expect(rows).toHaveLength(3);

    // Two column-header bars: one per block (add + remove each call renderHeader).
    const colHeaders = findColumnHeaders(tree);
    expect(colHeaders).toHaveLength(2);
  });
});

describe('DnsRecordsSection — multiple results', () => {
  it('renders one outer card per result, with the keys and headers in tree order', () => {
    const tree = renderSection([
      makeResult({
        name: 'site-a',
        custom_domain: 'a.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
      makeResult({
        name: 'site-b',
        custom_domain: 'b.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'b.com', value: '2.2.2.2' }],
      }),
    ]);
    const cards = findResultCards(tree);
    expect(cards).toHaveLength(2);
    expect(cards[0].key).toBe('site-a-0');
    expect(cards[1].key).toBe('site-b-1');

    const headers = findDomainHeaders(tree);
    expect(headers).toHaveLength(2);
    expect(collectText(headers[0])).toBe('DNS records for a.com');
    expect(collectText(headers[1])).toBe('DNS records for b.com');
  });

  it('skips results that fail extractDnsResults while preserving order for survivors', () => {
    // Mix: one with records (kept), one without (filtered), one with records (kept).
    const tree = renderSection([
      makeResult({
        name: 'with-records-1',
        custom_domain_dns_records: [{ type: 'A', domain: 'x.com', value: '1.1.1.1' }],
      }),
      makeResult({ name: 'no-records' }), // dropped: no `custom_domain_dns_records` key
      makeResult({
        name: 'with-records-2',
        custom_domain_dns_records: [{ type: 'A', domain: 'y.com', value: '2.2.2.2' }],
      }),
    ]);
    const cards = findResultCards(tree);
    expect(cards).toHaveLength(2);
    // Tree-order keys after filtering: idx is the position in the FILTERED
    // array, so [0, 1] not [0, 2].
    expect(cards[0].key).toBe('with-records-1-0');
    expect(cards[1].key).toBe('with-records-2-1');
  });
});

describe('DnsRecordsSection — Copy button click', () => {
  it('calls navigator.clipboard.writeText with the record value when clicked', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '203.0.113.42' }],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(1);
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('203.0.113.42');
  });

  it('passes the per-row record value (not a stale closure) for each row', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [
          { type: 'A', domain: 'a.com', value: 'value-a' },
          { type: 'TXT', domain: 'a.com', value: 'value-b' },
          { type: 'CNAME', domain: 'a.com', value: 'value-c' },
        ],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(3);

    (buttons[0].props as { onClick: () => void }).onClick();
    (buttons[1].props as { onClick: () => void }).onClick();
    (buttons[2].props as { onClick: () => void }).onClick();

    expect(mocks.writeText).toHaveBeenNthCalledWith(1, 'value-a');
    expect(mocks.writeText).toHaveBeenNthCalledWith(2, 'value-b');
    expect(mocks.writeText).toHaveBeenNthCalledWith(3, 'value-c');
  });

  it('passes the remove-record value when an amber-palette copy button is clicked', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'old.com', value: 'remove-me', required_action: 'remove' }],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(1);
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(mocks.writeText).toHaveBeenCalledWith('remove-me');
  });

  it('does not throw when writeText returns a rejected promise (the .catch swallows it)', async () => {
    mocks.writeTextResult.mode = 'reject';
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: 'will-be-rejected' }],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(1);
    const onClick = (buttons[0].props as { onClick: () => void }).onClick;
    // Click does not throw synchronously.
    expect(() => onClick()).not.toThrow();
    expect(mocks.writeText).toHaveBeenCalledWith('will-be-rejected');
    // Allow the rejection microtask to flush; the .catch(() => undefined)
    // turns it into a resolved-with-undefined promise. This wait should
    // complete without an unhandledrejection.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('renders the Copy button with the verbatim "Copy" label and "Copy value to clipboard" title', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(1);
    const props = buttons[0].props as { children: string; title: string };
    expect(props.children).toBe('Copy');
    expect(props.title).toBe('Copy value to clipboard');
  });
});

describe('DnsRecordsSection — verbatim hardcoded English strings (not in i18n catalog)', () => {
  it('renders the literal "DNS records for" prefix verbatim (not a translation key)', () => {
    const tree = renderSection([
      makeResult({
        custom_domain: 'example.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('DNS records for');
    // No translation-key shape (`deploy.foo.bar`).
    expect(text).not.toMatch(/deploy\.[a-zA-Z]+\.[a-zA-Z]+/);
  });

  it('renders the literal "Add the records below at your DNS provider to verify that you own" verbatim', () => {
    const tree = renderSection([
      makeResult({
        custom_domain: 'example.com',
        custom_domain_dns_records: [{ type: 'A', domain: 'example.com', value: '1.2.3.4' }],
      }),
    ]);
    const text = collectText(tree);
    expect(text).toContain('Add the records below at your DNS provider to verify that you own');
  });

  it('renders the literal Remove instruction with the U+2014 em-dash verbatim', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'old.com', value: '9.9.9.9', required_action: 'remove' }],
      }),
    ]);
    const text = collectText(tree);
    // Use the explicit unicode escape — to lock the byte-identical glyph.
    expect(text).toContain(
      'Remove the records below from your DNS provider — they conflict with the new configuration and block verification',
    );
    // Sanity: the text contains exactly one U+2014 (no accidental hyphen-minus).
    const matches = text.match(/—/g);
    expect(matches).not.toBeNull();
    expect((matches as RegExpMatchArray).length).toBe(1);
  });

  it('renders the literal "Copy" button label and "Copy value to clipboard" title verbatim', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
    ]);
    const buttons = findCopyButtons(tree);
    expect(buttons).toHaveLength(1);
    const props = buttons[0].props as { children: string; title: string };
    expect(props.children).toBe('Copy');
    expect(props.title).toBe('Copy value to clipboard');
  });

  it('renders the column-header labels "Type", "Domain name", "Value" verbatim', () => {
    const tree = renderSection([
      makeResult({
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
    ]);
    const colHeaders = findColumnHeaders(tree);
    expect(colHeaders).toHaveLength(1);
    const text = collectText(colHeaders[0]);
    expect(text).toContain('Type');
    expect(text).toContain('Domain name');
    expect(text).toContain('Value');
  });
});

describe('DnsRecordsSection — outer container child structure', () => {
  it('the outer .space-y-2 contains exactly N children for N filtered results', () => {
    const tree = renderSection([
      makeResult({
        name: 'a',
        custom_domain_dns_records: [{ type: 'A', domain: 'a.com', value: '1.1.1.1' }],
      }),
      makeResult({
        name: 'b',
        custom_domain_dns_records: [{ type: 'A', domain: 'b.com', value: '2.2.2.2' }],
      }),
    ]);
    const outer = findOuter(tree);
    const children = (outer.props as { children: React.ReactNode[] }).children;
    // dnsResults.map(...) produces an array of <div> elements.
    expect(Array.isArray(children)).toBe(true);
    expect((children as React.ReactNode[]).length).toBe(2);
  });
});
