/**
 * rf-canv-16 — `ConnectionTooltip` subcomponent.
 *
 * Floating tooltip rendered when a connection is hovered. Returns null when
 * `info` is null. Otherwise renders a fixed-positioned HTML overlay with:
 *   1. an Origin → Destination header,
 *   2. a relationship pill (color from `EDGE_COLORS[info.relationship]`,
 *      fallback `EDGE_COLORS.default`; underscores in the label replaced
 *      with spaces),
 *   3. an optional bundle-count chip when `info.bundleCount > 1`,
 *   4. up to six metadata rows, each gated on its field's truthiness:
 *      protocol (uppercased), port, latency, throughput, bandwidth, and
 *      securityRule (rendered with the orange #f59e0b color).
 *
 * Per blueprint risk #9, the SEVEN i18n keys
 *   `canvas.tooltip.{connections,protocol,port,latency,throughput,bandwidth,security}`
 * are preserved verbatim. The dedicated "i18n key preservation" test asserts
 * the exact key set + each row pairs with the right key. The `t` mock returns
 * the literal key string so we can assert against the keys themselves.
 *
 * Tree-walker pattern (cite `tree-walker-for-react-fc-tests-must-flatten-
 * nested-children-arrays`): invoke the FC as a function, walk the returned
 * React-element tree depth-first, assert on type / props / children.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// `t` is mocked to return the key verbatim so the i18n-key-preservation test
// can assert against the exact strings the orchestrator was passing before
// the extraction.
vi.mock('../../../../i18n', () => ({
  t: (key: string) => key,
}));

// `EDGE_COLORS` is read by the component for the relationship-pill color +
// border. We stub a small mapping so the fallback-to-default branch is
// exercisable without depending on the real palette file.
vi.mock('../svg-connection-path', () => ({
  EDGE_COLORS: {
    default: '#888888',
    invokes: '#aabbcc',
  } as Record<string, string>,
  // ConnectionTooltipInfo is a type — types don't need to be in the runtime
  // mock; consumers `import type { ... }` so this remains tree-shaken.
}));

// Import AFTER vi.mock so the mocked modules are bound.
import { ConnectionTooltip, type ConnectionTooltipProps } from '../connection-tooltip';
import type { ConnectionTooltipInfo } from '../svg-connection-path';

// ─── Tree walker ─────────────────────────────────────────────────────────────

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

/** Collect every literal text leaf rendered by the tree (string + number). */
function collectText(tree: React.ReactNode): string[] {
  const out: string[] = [];
  const visit = (node: ReactNodeLike): void => {
    if (node == null || typeof node === 'boolean') return;
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (typeof node === 'number') {
      out.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const c of node) visit(c as ReactNodeLike);
      return;
    }
    const el = node as React.ReactElement;
    const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
    visit(children ?? null);
  };
  visit(tree);
  return out;
}

/** Find the first <span> whose visible string text is exactly `text`. */
function findSpanByText(tree: React.ReactNode, text: string): React.ReactElement | undefined {
  return findByPredicate(tree, (el) => {
    if (el.type !== 'span') return false;
    const c = (el.props as { children?: React.ReactNode }).children;
    return typeof c === 'string' && c === text;
  })[0];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeInfo = (overrides: Partial<ConnectionTooltipInfo> = {}): ConnectionTooltipInfo => ({
  connectionId: 'edge-1',
  mouseX: 100,
  mouseY: 200,
  fromLabel: 'A',
  toLabel: 'B',
  relationship: 'invokes',
  bundleCount: 1,
  ...overrides,
});

const render = (overrides: Partial<ConnectionTooltipProps> = {}) =>
  ConnectionTooltip({ info: makeInfo(), ...overrides });

// ═══════════════════════════════════════════════════════════════════════════
// Null / empty
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — null gate', () => {
  it('info=null → returns null (renders nothing)', () => {
    const tree = ConnectionTooltip({ info: null });
    expect(tree).toBeNull();
  });

  it('info=null → tree-walker produces zero elements', () => {
    const tree = ConnectionTooltip({ info: null });
    const elements = findByPredicate(tree, () => true);
    expect(elements).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Header
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — header', () => {
  it('renders the fromLabel and toLabel verbatim', () => {
    const tree = render({ info: makeInfo({ fromLabel: 'origin-svc', toLabel: 'dest-svc' }) });
    expect(findSpanByText(tree, 'origin-svc')).toBeDefined();
    expect(findSpanByText(tree, 'dest-svc')).toBeDefined();
  });

  it('renders the → arrow between the labels', () => {
    const tree = render({ info: makeInfo({ fromLabel: 'A', toLabel: 'B' }) });
    expect(findSpanByText(tree, '→')).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Relationship badge
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — relationship badge', () => {
  it('replaces underscores with spaces in the displayed label', () => {
    const tree = render({ info: makeInfo({ relationship: 'depends_on_strict' }) });
    expect(findSpanByText(tree, 'depends on strict')).toBeDefined();
    // The original underscored form must not appear as a literal text leaf.
    expect(collectText(tree)).not.toContain('depends_on_strict');
  });

  it('uses EDGE_COLORS[relationship] for the pill color when present', () => {
    const tree = render({ info: makeInfo({ relationship: 'invokes' }) });
    const pill = findSpanByText(tree, 'invokes');
    expect(pill).toBeDefined();
    const style = (pill!.props as { style: Record<string, string | number> }).style;
    // Mock has invokes -> '#aabbcc'.
    expect(style.color).toBe('#aabbcc');
    expect(style.background).toBe('#aabbcc1a');
    expect(style.border).toBe('1px solid #aabbcc33');
  });

  it('falls back to EDGE_COLORS.default when relationship is not in the map', () => {
    const tree = render({ info: makeInfo({ relationship: 'unknown_rel' }) });
    const pill = findSpanByText(tree, 'unknown rel');
    expect(pill).toBeDefined();
    const style = (pill!.props as { style: Record<string, string | number> }).style;
    expect(style.color).toBe('#888888');
    expect(style.background).toBe('#8888881a');
    expect(style.border).toBe('1px solid #88888833');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bundle chip
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — bundle chip', () => {
  it('bundleCount=1 → no bundle chip is rendered', () => {
    const tree = render({ info: makeInfo({ bundleCount: 1 }) });
    expect(collectText(tree)).not.toContain('canvas.tooltip.connections');
  });

  it('bundleCount=2 → renders the chip with the count + i18n connections key', () => {
    const tree = render({ info: makeInfo({ bundleCount: 2 }) });
    const text = collectText(tree);
    expect(text).toContain('2');
    expect(text).toContain('canvas.tooltip.connections');
  });

  it('bundleCount=5 → renders the higher count', () => {
    const tree = render({ info: makeInfo({ bundleCount: 5 }) });
    expect(collectText(tree)).toContain('5');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Metadata rows
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — metadata rows', () => {
  it('protocol is uppercased and paired with t("canvas.tooltip.protocol")', () => {
    const tree = render({ info: makeInfo({ protocol: 'http' }) });
    expect(findSpanByText(tree, 'canvas.tooltip.protocol')).toBeDefined();
    expect(findSpanByText(tree, 'HTTP')).toBeDefined();
  });

  it('port is paired with t("canvas.tooltip.port") verbatim (not uppercased)', () => {
    const tree = render({ info: makeInfo({ port: '8080' }) });
    expect(findSpanByText(tree, 'canvas.tooltip.port')).toBeDefined();
    expect(findSpanByText(tree, '8080')).toBeDefined();
  });

  it('latency is paired with t("canvas.tooltip.latency")', () => {
    const tree = render({ info: makeInfo({ latency: '12ms' }) });
    expect(findSpanByText(tree, 'canvas.tooltip.latency')).toBeDefined();
    expect(findSpanByText(tree, '12ms')).toBeDefined();
  });

  it('throughput is paired with t("canvas.tooltip.throughput")', () => {
    const tree = render({ info: makeInfo({ throughput: '500/s' }) });
    expect(findSpanByText(tree, 'canvas.tooltip.throughput')).toBeDefined();
    expect(findSpanByText(tree, '500/s')).toBeDefined();
  });

  it('bandwidth is paired with t("canvas.tooltip.bandwidth")', () => {
    const tree = render({ info: makeInfo({ bandwidth: '1Gbps' }) });
    expect(findSpanByText(tree, 'canvas.tooltip.bandwidth')).toBeDefined();
    expect(findSpanByText(tree, '1Gbps')).toBeDefined();
  });

  it('securityRule pairs with t("canvas.tooltip.security") and uses the orange #f59e0b color on both spans', () => {
    const tree = render({ info: makeInfo({ securityRule: 'tls-required' }) });
    const labelSpan = findSpanByText(tree, 'canvas.tooltip.security');
    const valueSpan = findSpanByText(tree, 'tls-required');
    expect(labelSpan).toBeDefined();
    expect(valueSpan).toBeDefined();
    expect((labelSpan!.props as { style: Record<string, string> }).style.color).toBe('#f59e0b');
    expect((valueSpan!.props as { style: Record<string, string> }).style.color).toBe('#f59e0b');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Truthy-only gating — each row absent when its field is undefined
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — truthy-only metadata gates', () => {
  it('minimal info (no metadata) renders header + relationship pill but no metadata rows', () => {
    const tree = render({ info: makeInfo() });
    const text = collectText(tree);
    // Header + pill text present.
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).toContain('invokes');
    // None of the metadata i18n keys appear.
    expect(text).not.toContain('canvas.tooltip.protocol');
    expect(text).not.toContain('canvas.tooltip.port');
    expect(text).not.toContain('canvas.tooltip.latency');
    expect(text).not.toContain('canvas.tooltip.throughput');
    expect(text).not.toContain('canvas.tooltip.bandwidth');
    expect(text).not.toContain('canvas.tooltip.security');
  });

  it('protocol absent when info.protocol is undefined', () => {
    const tree = render({ info: makeInfo({ port: '80' }) });
    expect(collectText(tree)).not.toContain('canvas.tooltip.protocol');
    expect(collectText(tree)).toContain('canvas.tooltip.port');
  });

  it('port absent when info.port is undefined', () => {
    const tree = render({ info: makeInfo({ protocol: 'tcp' }) });
    expect(collectText(tree)).not.toContain('canvas.tooltip.port');
    expect(collectText(tree)).toContain('canvas.tooltip.protocol');
  });

  it('latency / throughput / bandwidth / securityRule each absent when undefined', () => {
    const tree = render({ info: makeInfo({ protocol: 'tcp' }) });
    const text = collectText(tree);
    expect(text).not.toContain('canvas.tooltip.latency');
    expect(text).not.toContain('canvas.tooltip.throughput');
    expect(text).not.toContain('canvas.tooltip.bandwidth');
    expect(text).not.toContain('canvas.tooltip.security');
  });

  it('empty-string protocol is falsy — row absent (verbatim truthy gate)', () => {
    const tree = render({ info: makeInfo({ protocol: '' }) });
    expect(collectText(tree)).not.toContain('canvas.tooltip.protocol');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Risk #9 — i18n key preservation (verbatim, exactly seven keys)
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — risk #9 i18n key preservation', () => {
  it('the tooltip references EXACTLY seven i18n keys with the documented strings', () => {
    // Render with every metadata field set + bundleCount > 1 so every i18n
    // call is exercised.
    const tree = render({
      info: makeInfo({
        bundleCount: 3,
        protocol: 'http',
        port: '443',
        latency: '5ms',
        throughput: '1k/s',
        bandwidth: '10Gbps',
        securityRule: 'tls',
      }),
    });
    const text = collectText(tree);
    // Filter the text to just the i18n key strings.
    const keys = text.filter((s) => s.startsWith('canvas.tooltip.'));
    expect(keys.sort()).toEqual(
      [
        'canvas.tooltip.bandwidth',
        'canvas.tooltip.connections',
        'canvas.tooltip.latency',
        'canvas.tooltip.port',
        'canvas.tooltip.protocol',
        'canvas.tooltip.security',
        'canvas.tooltip.throughput',
      ].sort(),
    );
    // Exactly seven keys, no more no less.
    expect(keys).toHaveLength(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Outer container positioning
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionTooltip — outer container positioning', () => {
  it('positions the outer div at left=mouseX+14, top=mouseY+14 (fixed)', () => {
    const tree = render({ info: makeInfo({ mouseX: 100, mouseY: 200 }) });
    const outer = tree as React.ReactElement;
    expect(outer).not.toBeNull();
    expect(outer.type).toBe('div');
    const style = (outer.props as { style: Record<string, string | number> }).style;
    expect(style.position).toBe('fixed');
    expect(style.left).toBe(114);
    expect(style.top).toBe(214);
  });

  it('respects different mouseX/mouseY values', () => {
    const tree = render({ info: makeInfo({ mouseX: 0, mouseY: 0 }) });
    const outer = tree as React.ReactElement;
    const style = (outer.props as { style: Record<string, string | number> }).style;
    expect(style.left).toBe(14);
    expect(style.top).toBe(14);
  });

  it('outer div has pointerEvents=none and zIndex=9999', () => {
    const tree = render({ info: makeInfo() });
    const outer = tree as React.ReactElement;
    const style = (outer.props as { style: Record<string, string | number> }).style;
    expect(style.pointerEvents).toBe('none');
    expect(style.zIndex).toBe(9999);
  });
});
