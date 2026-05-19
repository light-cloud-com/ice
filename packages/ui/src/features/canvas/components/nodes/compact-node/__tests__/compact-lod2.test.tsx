/**
 * Tests for `CompactLod2` — the mid-detail compact-node renderer
 * (NodeHeader + brand icon + service line + status dot).
 *
 * Component is React.memo-wrapped; we reach the inner FC via
 * `(CompactLod2 as { type: FC }).type(props)`.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    ConnectionDragGlow: named('MockConnectionDragGlow'),
    ConnectionPorts: named('MockConnectionPorts'),
    NodeHeader: named('MockNodeHeader'),
    StatusDot: named('MockStatusDot'),
  };
});

vi.mock('../../_shared/connection-drag-glow', () => ({ ConnectionDragGlow: mocks.ConnectionDragGlow }));
vi.mock('../../_shared/connection-ports', () => ({ ConnectionPorts: mocks.ConnectionPorts }));
vi.mock('../../_shared/node-header', () => ({ NodeHeader: mocks.NodeHeader }));
vi.mock('../../_shared/status-dot', () => ({ StatusDot: mocks.StatusDot }));

import { CompactLod2 } from '../compact-lod2';
import type { BrandIcon } from '../../../../../../assets/icons/brand-registry';
import type { NodePipelineStatus } from '../types';

const MockConnectionDragGlow = mocks.ConnectionDragGlow;
const MockConnectionPorts = mocks.ConnectionPorts;
const MockNodeHeader = mocks.NodeHeader;
const MockStatusDot = mocks.StatusDot;

// ─── tree walker ──────────────────────────────────────────────────────

type ReactNodeLike = React.ReactNode;
function* walk(node: ReactNodeLike): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
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
function findByPredicate(tree: React.ReactNode, predicate: (el: React.ReactElement) => boolean): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const renderLod2 = (props: Partial<React.ComponentProps<typeof CompactLod2>> = {}): React.ReactElement => {
  const Inner = (
    CompactLod2 as unknown as {
      type: (p: React.ComponentProps<typeof CompactLod2>) => React.ReactElement;
    }
  ).type;
  const defaults: React.ComponentProps<typeof CompactLod2> = {
    nodeId: 'node-1',
    x: 100,
    y: 200,
    label: 'My Node',
    category: 'Compute',
    categoryGlow: '#abcdef',
    brandIcon: null,
    providerUrl: 'https://example.com/icon.svg',
    serviceLineText: 'Lambda · Node 18',
    statusLabel: '',
    statusColor: '#22c55e',
    border: '#444',
    isSelected: false,
    isHovered: false,
    effectivePipelineStatus: null,
    connectionDragState: null,
    reducedMotion: false,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('CompactLod2 — React.memo + displayName', () => {
  it('is wrapped in React.memo', () => {
    const t = (CompactLod2 as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof t).toBe('symbol');
    expect(String(t)).toBe('Symbol(react.memo)');
  });

  it('carries displayName "CompactLod2"', () => {
    expect((CompactLod2 as unknown as { displayName: string }).displayName).toBe('CompactLod2');
  });
});

describe('CompactLod2 — outer <g> attributes', () => {
  it('writes data-node-id from nodeId', () => {
    const tree = renderLod2({ nodeId: 'block-7' });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('block-7');
  });

  it('cursor: crosshair on valid-target, move otherwise', () => {
    expect(
      (renderLod2({ connectionDragState: 'valid-target' }).props as { style: { cursor: string } }).style.cursor,
    ).toBe('crosshair');
    expect((renderLod2({ connectionDragState: null }).props as { style: { cursor: string } }).style.cursor).toBe(
      'move',
    );
  });

  it('opacity 0.3 on invalid-target, 1 otherwise', () => {
    expect((renderLod2({ connectionDragState: 'invalid-target' }).props as { opacity: number }).opacity).toBe(0.3);
    expect((renderLod2({ connectionDragState: null }).props as { opacity: number }).opacity).toBe(1);
  });

  it('forwards onMouseEnter/onMouseLeave', () => {
    const calls: string[] = [];
    const tree = renderLod2({
      onMouseEnter: () => calls.push('e'),
      onMouseLeave: () => calls.push('l'),
    });
    const props = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    props.onMouseEnter();
    props.onMouseLeave();
    expect(calls).toEqual(['e', 'l']);
  });
});

describe('CompactLod2 — ConnectionDragGlow + ConnectionPorts', () => {
  it('renders ConnectionDragGlow when valid-target', () => {
    expect(findByType(renderLod2({ connectionDragState: 'valid-target' }), MockConnectionDragGlow)).toHaveLength(1);
  });

  it('omits ConnectionDragGlow otherwise', () => {
    for (const ds of ['invalid-target', 'source', null] as const) {
      expect(findByType(renderLod2({ connectionDragState: ds }), MockConnectionDragGlow)).toHaveLength(0);
    }
  });

  it('renders ConnectionPorts on hover or valid-target only', () => {
    expect(findByType(renderLod2({ isHovered: true }), MockConnectionPorts)).toHaveLength(1);
    expect(findByType(renderLod2({ connectionDragState: 'valid-target' }), MockConnectionPorts)).toHaveLength(1);
    expect(findByType(renderLod2({ isHovered: false, connectionDragState: null }), MockConnectionPorts)).toHaveLength(
      0,
    );
  });

  it('forwards isValidTarget into ConnectionPorts', () => {
    const ports = findByType(renderLod2({ connectionDragState: 'valid-target' }), MockConnectionPorts)[0];
    expect((ports.props as { isValidTarget: boolean }).isValidTarget).toBe(true);
    const ports2 = findByType(renderLod2({ isHovered: true, connectionDragState: null }), MockConnectionPorts)[0];
    expect((ports2.props as { isValidTarget: boolean }).isValidTarget).toBe(false);
  });
});

describe('CompactLod2 — inner card geometry', () => {
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(
      tree,
      (el) => el.type === 'div' && (el.props as { style?: { boxSizing?: string } }).style?.boxSizing === 'border-box',
    )[0];

  it('inner border: #22c55e on valid-target', () => {
    const tree = renderLod2({ connectionDragState: 'valid-target', border: '#444' });
    const card = findCard(tree)!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #22c55e');
  });

  it('inner border uses border prop otherwise', () => {
    const tree = renderLod2({ border: '#abc' });
    const card = findCard(tree)!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #abc');
  });

  it('selected: boxShadow includes categoryGlow', () => {
    const tree = renderLod2({ isSelected: true, categoryGlow: '#deadbe' });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toContain('#deadbe');
  });

  it('hovered (not selected): hover boxShadow', () => {
    const tree = renderLod2({ isSelected: false, isHovered: true });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('default: resting boxShadow', () => {
    const tree = renderLod2({ isSelected: false, isHovered: false });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });
});

describe('CompactLod2 — header / service-line composition', () => {
  it('renders NodeHeader with category, categoryColor, label, maxChars=20', () => {
    const tree = renderLod2({ category: 'Database', categoryGlow: '#8b5cf6', label: 'pg' });
    const hdr = findByType(tree, MockNodeHeader)[0];
    const props = hdr.props as { category: string; categoryColor: string; label: string; maxChars: number };
    expect(props.category).toBe('Database');
    expect(props.categoryColor).toBe('#8b5cf6');
    expect(props.label).toBe('pg');
    expect(props.maxChars).toBe(20);
  });

  it('renders brand icon when brandIcon is set (uses brandIcon.url)', () => {
    const brandIcon: BrandIcon = { url: 'https://b.example/icon.svg', label: 'X' };
    const tree = renderLod2({ brandIcon, providerUrl: 'https://p.example/icon.svg' });
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://b.example/icon.svg');
  });

  it('falls back to providerUrl when brandIcon is null', () => {
    const tree = renderLod2({ brandIcon: null, providerUrl: 'https://p.example/icon.svg' });
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://p.example/icon.svg');
  });

  it('does not render <img> when both brandIcon null and providerUrl empty', () => {
    const tree = renderLod2({ brandIcon: null, providerUrl: '' });
    expect(findByType(tree, 'img')).toHaveLength(0);
  });

  it('renders truncated serviceLineText (>24 chars adds ellipsis)', () => {
    const tree = renderLod2({ serviceLineText: 'x'.repeat(30) });
    const span = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const c = (el.props as { children?: unknown }).children;
      return typeof c === 'string' && c.length === 25 && c.endsWith('…');
    });
    expect(span.length).toBe(1);
  });

  it('renders untruncated serviceLineText (≤24 chars)', () => {
    const tree = renderLod2({ serviceLineText: 'short' });
    const span = findByPredicate(
      tree,
      (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'short',
    );
    expect(span.length).toBe(1);
  });

  it('omits service-line span when text empty', () => {
    const tree = renderLod2({ serviceLineText: '' });
    // No service-line span (matching the truncated text); only NodeHeader + StatusDot remain
    const lineSpans = findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { fontSize?: number } }).style;
      return style?.fontSize === 10;
    });
    expect(lineSpans.length).toBe(0);
  });
});

describe('CompactLod2 — StatusDot gating + color', () => {
  it('renders StatusDot when statusLabel is set', () => {
    expect(findByType(renderLod2({ statusLabel: 'Active' }), MockStatusDot)).toHaveLength(1);
  });

  it('omits StatusDot when statusLabel empty', () => {
    expect(findByType(renderLod2({ statusLabel: '' }), MockStatusDot)).toHaveLength(0);
  });

  it('uses pipeline color (#22c55e) when status=success', () => {
    const ps: NodePipelineStatus = { status: 'success' };
    const dot = findByType(renderLod2({ statusLabel: 'Active', effectivePipelineStatus: ps }), MockStatusDot)[0];
    expect((dot.props as { color: string }).color).toBe('#22c55e');
  });

  it('uses pipeline color (#ef4444) when status=failed', () => {
    const ps: NodePipelineStatus = { status: 'failed' };
    const dot = findByType(renderLod2({ statusLabel: 'Failed', effectivePipelineStatus: ps }), MockStatusDot)[0];
    expect((dot.props as { color: string }).color).toBe('#ef4444');
  });

  it('uses pipeline color (#3b82f6) for in-flight statuses', () => {
    for (const s of ['building', 'deploying', 'queued'] as const) {
      const ps: NodePipelineStatus = { status: s };
      const dot = findByType(renderLod2({ statusLabel: 'X', effectivePipelineStatus: ps }), MockStatusDot)[0];
      expect((dot.props as { color: string }).color).toBe('#3b82f6');
    }
  });

  it('falls back to statusColor when no pipeline status', () => {
    const dot = findByType(
      renderLod2({ statusLabel: 'X', statusColor: '#cafe22', effectivePipelineStatus: null }),
      MockStatusDot,
    )[0];
    expect((dot.props as { color: string }).color).toBe('#cafe22');
  });

  it('forwards label and radius=4 to StatusDot', () => {
    const dot = findByType(renderLod2({ statusLabel: 'Active' }), MockStatusDot)[0];
    const props = dot.props as { label: string; radius: number };
    expect(props.label).toBe('Active');
    expect(props.radius).toBe(4);
  });
});
