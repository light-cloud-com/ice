/**
 * rf-pdpl-10 — LogPanel.
 *
 * Fifth Layer 1 leaf-component extraction in rf-pdpl. Direct-FC tree-walker
 * pattern (cite `tree-walker-must-invoke-file-private-fcs-when-extracted-component-keeps-an-inner-helper`,
 * `tree-walker-for-react-fc-tests-must-flatten-nested-children-arrays`):
 * LogPanel has no inner FCs and no mocked dependencies, so the walker only
 * needs the array-flatten + element-recursion branches. No `lucide-react` or
 * `useTranslation` mocks required.
 *
 * Two LogPanel-specific test concerns:
 * 1. The outer `<div>`'s children prop is a mixed list — the array result of
 *    `logs.map(...)` plus the trailing `<div ref={logEndRef} />`. React
 *    represents this as `[arrayOfRows, trailingDiv]`, NOT a flat list. The
 *    array-flatten walker handles this; positional assertions about "the
 *    ref-div is last" need to check the array-then-trailing shape.
 * 2. In React 18 (this codebase's version) `ref` is a top-level field on the
 *    React element (`el.ref`), NOT inside `el.props`. The ref-pass-through
 *    test reads `el.ref` directly — `el.props.ref` would be `undefined`.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { LogPanel } from '../log-panel';

// ─── Tree-walker (rf-pdpl-7/-8/-9 style) ────────────────────────────────────
//
// Walks the React element tree, INVOKING any function `el.type` it
// encounters (none here — LogPanel renders only HTML elements) so the
// predicate / collectText helpers see the full subtree.

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

// In React 18 the `ref` is a top-level field on the React element, NOT in
// `props`. The public `ReactElement` type does not expose it (the `ref` field
// is part of the internal `LegacyReactElement` shape), so a typed accessor is
// needed for the ref-pass-through assertions. This caster reads the field via
// an `unknown` round-trip rather than `any` to keep `no-explicit-any` happy.
const elementRef = (el: React.ReactElement): React.Ref<unknown> | null =>
  (el as unknown as { ref?: React.Ref<unknown> | null }).ref ?? null;

// ─── Helpers ────────────────────────────────────────────────────────────────

const renderPanel = (logs: string[], logEndRef: React.RefObject<HTMLDivElement>): React.ReactElement =>
  (
    LogPanel as unknown as (props: { logs: string[]; logEndRef: React.RefObject<HTMLDivElement> }) => React.ReactElement
  )({ logs, logEndRef });

// Extract the outer `<div id="ice-deploy-log">` (the LogPanel root).
const findOuter = (tree: React.ReactNode): React.ReactElement => {
  const found = findByPredicate(tree, (el) => {
    if (el.type !== 'div') return false;
    const props = el.props as { id?: string };
    return props.id === 'ice-deploy-log';
  });
  expect(found).toHaveLength(1);
  return found[0];
};

// The outer div's children prop is `[<arrayOfRows>, <trailingRefDiv>]`.
// Flatten to a positional list so we can assert "trailing div is last".
const flattenChildren = (parent: React.ReactElement): React.ReactNode[] => {
  const children = (parent.props as { children?: React.ReactNode }).children;
  if (children == null) return [];
  if (!Array.isArray(children)) return [children];
  const out: React.ReactNode[] = [];
  for (const c of children) {
    if (Array.isArray(c)) {
      for (const cc of c) out.push(cc);
    } else {
      out.push(c);
    }
  }
  return out;
};

// Pull every `<div className="flex gap-2">` row inside the outer div. These
// are the per-log lines (the `logs.map(...)` output).
const findLogRows = (tree: React.ReactNode): React.ReactElement[] => {
  const outer = findOuter(tree);
  const flat = flattenChildren(outer);
  return flat.filter(
    (c): c is React.ReactElement =>
      c != null &&
      typeof c === 'object' &&
      (c as React.ReactElement).type === 'div' &&
      typeof (c as React.ReactElement).props === 'object' &&
      ((c as React.ReactElement).props as { className?: string }).className === 'flex gap-2',
  );
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LogPanel — outer container', () => {
  it('returns a single root <div> with id="ice-deploy-log"', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel([], ref);
    expect(tree.type).toBe('div');
    const props = tree.props as { id: string };
    expect(props.id).toBe('ice-deploy-log');
  });

  it('preserves the byte-identical className on the outer <div>', () => {
    // Lock the entire className string verbatim. Any reorder, gap, or token
    // change here is a regression — the visual styling depends on every token
    // (max-h-48 controls the scroll, font-mono fixes the line-number column,
    // text-slate-300 + bg-slate-950 produce the dark-terminal contrast).
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel([], ref);
    const className = (tree.props as { className: string }).className;
    expect(className).toBe(
      'rounded-md border border-border bg-slate-950 text-slate-300 p-3 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed',
    );
  });
});

describe('LogPanel — empty logs (defensive; orchestrator gates length > 0)', () => {
  it('renders the outer container with no rows but with the trailing ref-div', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel([], ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(0);
    // Trailing ref-div is still present.
    const flat = flattenChildren(findOuter(tree));
    const trailing = flat[flat.length - 1] as React.ReactElement;
    expect(trailing).toBeDefined();
    expect(trailing.type).toBe('div');
    // Outer's flattened children are [emptyArray-from-map, trailingDiv]; the
    // empty-array case still yields the trailing div as the *last* item.
    expect(elementRef(trailing)).toBe(ref);
  });
});

describe('LogPanel — single log', () => {
  it('renders 1 row with line number "  1" (3-char space-padded) and the log text', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['hello world'], ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(1);

    // Each row's children are [<lineNumberSpan>, <logTextSpan>].
    const rowChildren = (rows[0].props as { children: React.ReactNode[] }).children;
    expect(Array.isArray(rowChildren)).toBe(true);
    const [lnSpan, txtSpan] = rowChildren as [React.ReactElement, React.ReactElement];

    // Line-number span: "text-ice-text-3 select-none" + 3-char padded text.
    expect(lnSpan.type).toBe('span');
    const lnCn = (lnSpan.props as { className: string }).className;
    expect(lnCn).toBe('text-ice-text-3 select-none');
    const lnText = (lnSpan.props as { children: string }).children;
    expect(lnText).toBe('  1');
    // Length sanity — exactly 3 characters, the leading two are spaces.
    expect(lnText.length).toBe(3);
    expect(lnText[0]).toBe(' ');
    expect(lnText[1]).toBe(' ');
    expect(lnText[2]).toBe('1');

    // Log-text span: no className, just the log string.
    expect(txtSpan.type).toBe('span');
    const txtChild = (txtSpan.props as { children: string }).children;
    expect(txtChild).toBe('hello world');
  });

  it('uses the array index as the row key (`key={0}`)', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['only-row'], ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('0');
  });
});

describe('LogPanel — multiple logs', () => {
  it('renders 3 rows with line numbers "  1", "  2", "  3" in order', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['first', 'second', 'third'], ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(3);

    const lineNumbers = rows.map((r) => {
      const children = (r.props as { children: React.ReactNode[] }).children;
      const [lnSpan] = children as [React.ReactElement];
      return (lnSpan.props as { children: string }).children;
    });
    expect(lineNumbers).toEqual(['  1', '  2', '  3']);

    const logTexts = rows.map((r) => {
      const children = (r.props as { children: React.ReactNode[] }).children;
      const [, txtSpan] = children as [React.ReactElement, React.ReactElement];
      return (txtSpan.props as { children: string }).children;
    });
    expect(logTexts).toEqual(['first', 'second', 'third']);
  });

  it('uses the array index as the row key for each row (0, 1, 2)', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['a', 'b', 'c'], ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(3);
    expect(rows[0].key).toBe('0');
    expect(rows[1].key).toBe('1');
    expect(rows[2].key).toBe('2');
  });

  it('applies the row className "flex gap-2" to every row', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['a', 'b'], ref);
    const rows = findLogRows(tree);
    for (const r of rows) {
      expect((r.props as { className: string }).className).toBe('flex gap-2');
    }
  });
});

describe('LogPanel — line-number padding', () => {
  it('pads single-digit line numbers to 3 characters (logs.length === 9 → "  9")', () => {
    const ref = React.createRef<HTMLDivElement>();
    const logs = Array.from({ length: 9 }, (_, i) => `log-${i}`);
    const tree = renderPanel(logs, ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(9);
    // Last row is index 8 → display number 9 → "  9".
    const lastRowChildren = (rows[8].props as { children: React.ReactNode[] }).children;
    const [lnSpan] = lastRowChildren as [React.ReactElement];
    expect((lnSpan.props as { children: string }).children).toBe('  9');
  });

  it('pads two-digit line numbers to 3 characters (display number 10 → " 10")', () => {
    const ref = React.createRef<HTMLDivElement>();
    const logs = Array.from({ length: 10 }, (_, i) => `log-${i}`);
    const tree = renderPanel(logs, ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(10);
    // Row index 9 → display number 10 → " 10".
    const lastRowChildren = (rows[9].props as { children: React.ReactNode[] }).children;
    const [lnSpan] = lastRowChildren as [React.ReactElement];
    expect((lnSpan.props as { children: string }).children).toBe(' 10');
  });

  it('does not pad three-digit line numbers (display number 100 → "100", exactly 3 chars)', () => {
    // Confirm `String(100).padStart(3, ' ') === '100'`. The padStart is a
    // no-op once the string is already 3 chars long; the column stays
    // perfectly aligned for the first 999 lines.
    expect(String(100).padStart(3, ' ')).toBe('100');

    const ref = React.createRef<HTMLDivElement>();
    const logs = Array.from({ length: 100 }, (_, i) => `log-${i}`);
    const tree = renderPanel(logs, ref);
    const rows = findLogRows(tree);
    expect(rows).toHaveLength(100);
    // Row index 99 → display number 100 → '100' (no leading space).
    const lastRowChildren = (rows[99].props as { children: React.ReactNode[] }).children;
    const [lnSpan] = lastRowChildren as [React.ReactElement];
    const lnText = (lnSpan.props as { children: string }).children;
    expect(lnText).toBe('100');
    expect(lnText.length).toBe(3);
    expect(lnText[0]).toBe('1'); // No leading space.
  });

  it('does not truncate four-digit line numbers — display number 1000 → "1000" (4 chars)', () => {
    // padStart never truncates; it only pads up to the target length. So a
    // log line at index 999 (display number 1000) becomes the literal "1000"
    // (4 chars), which breaks the column alignment but doesn't crash.
    // Documenting the behavior here so a future "fix" doesn't switch to a
    // padding scheme that silently truncates.
    expect(String(1000).padStart(3, ' ')).toBe('1000');
  });
});

describe('LogPanel — trailing ref-div (auto-scroll anchor)', () => {
  it('renders the ref-div as the last child of the outer <div>', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['a', 'b', 'c'], ref);
    const flat = flattenChildren(findOuter(tree));
    // The outer's children are [arrayOfRows, trailingDiv]; flattenChildren
    // expands the inner array, producing [row0, row1, row2, trailingDiv].
    expect(flat).toHaveLength(4);
    const trailing = flat[flat.length - 1] as React.ReactElement;
    expect(trailing.type).toBe('div');
  });

  it("passes the logEndRef prop through to the trailing <div>'s ref field", () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['solo'], ref);
    const flat = flattenChildren(findOuter(tree));
    const trailing = flat[flat.length - 1] as React.ReactElement;
    expect(trailing.type).toBe('div');
    // React 18: `ref` is a top-level field on the element (NOT inside props).
    // Reference equality — same RefObject the caller created and passed in.
    expect(elementRef(trailing)).toBe(ref);
  });

  it('the trailing <div> has no other props (no className, no id, no children)', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel([], ref);
    const flat = flattenChildren(findOuter(tree));
    const trailing = flat[flat.length - 1] as React.ReactElement;
    const props = trailing.props as Record<string, unknown>;
    expect(props.className).toBeUndefined();
    expect(props.id).toBeUndefined();
    expect(props.children).toBeUndefined();
  });

  it('renders the ref-div even when logs is empty (defensive shape)', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel([], ref);
    const flat = flattenChildren(findOuter(tree));
    // Empty `logs.map(...)` produces an empty array; flatten yields just the
    // trailing div.
    expect(flat).toHaveLength(1);
    const trailing = flat[0] as React.ReactElement;
    expect(trailing.type).toBe('div');
    expect(elementRef(trailing)).toBe(ref);
  });

  it('renders the ref-div AFTER all log rows (positional invariant)', () => {
    const ref = React.createRef<HTMLDivElement>();
    const tree = renderPanel(['a', 'b'], ref);
    const flat = flattenChildren(findOuter(tree));
    expect(flat).toHaveLength(3);
    // First two are the log rows ("flex gap-2" className).
    expect((flat[0] as React.ReactElement).type).toBe('div');
    expect(((flat[0] as React.ReactElement).props as { className: string }).className).toBe('flex gap-2');
    expect((flat[1] as React.ReactElement).type).toBe('div');
    expect(((flat[1] as React.ReactElement).props as { className: string }).className).toBe('flex gap-2');
    // Last is the ref-div with no className.
    const trailing = flat[2] as React.ReactElement;
    expect(trailing.type).toBe('div');
    expect((trailing.props as { className?: string }).className).toBeUndefined();
    expect(elementRef(trailing)).toBe(ref);
  });
});
