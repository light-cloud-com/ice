/**
 * Tests for `CompactLod1` — the iconic LOD1 (zoomed-out) compact-node
 * renderer. The component is wrapped in `React.memo`, so we reach the
 * inner FC via `(CompactLod1 as { type: FC }).type(props)` under the
 * direct-FC tree-walker pattern (no jsdom).
 */

import React from 'react';
import { describe, it, expect } from 'vitest';

const mocks = vi.hoisted(() => {
  const named = (name: string): React.FC<Record<string, unknown>> => {
    const fc: React.FC<Record<string, unknown>> = () => null;
    fc.displayName = name;
    return fc;
  };
  return {
    ConnectionDragGlow: named('MockConnectionDragGlow'),
    ConnectionPorts: named('MockConnectionPorts'),
  };
});

vi.mock('../../_shared/connection-drag-glow', () => ({
  ConnectionDragGlow: mocks.ConnectionDragGlow,
}));
vi.mock('../../_shared/connection-ports', () => ({
  ConnectionPorts: mocks.ConnectionPorts,
}));

import { vi } from 'vitest';
import { CompactLod1 } from '../compact-lod1';
import type { NodePipelineStatus } from '../types';

const MockConnectionDragGlow = mocks.ConnectionDragGlow;
const MockConnectionPorts = mocks.ConnectionPorts;

// ─── tree-walker helpers ──────────────────────────────────────────────

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
function findByPredicate(
  tree: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) if (el && predicate(el)) out.push(el);
  return out;
}
function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  return findByPredicate(tree, (el) => el.type === type);
}

const renderLod1 = (
  props: Partial<React.ComponentProps<typeof CompactLod1>> = {},
): React.ReactElement => {
  const Inner = (CompactLod1 as unknown as {
    type: (p: React.ComponentProps<typeof CompactLod1>) => React.ReactElement;
  }).type;
  const defaults: React.ComponentProps<typeof CompactLod1> = {
    nodeId: 'node-1',
    x: 100,
    y: 200,
    label: 'My Node',
    brandIconUrl: undefined,
    providerUrl: 'https://example.com/icon.svg',
    isSelected: false,
    isHovered: false,
    statusColor: '#22c55e',
    categoryGlow: '#abcdef',
    border: '#444',
    effectivePipelineStatus: null,
    connectionDragState: null,
    reducedMotion: false,
    onMouseEnter: () => {},
    onMouseLeave: () => {},
  };
  return Inner({ ...defaults, ...props });
};

describe('CompactLod1 — React.memo boundary', () => {
  it('is wrapped in React.memo', () => {
    const memoTypeof = (CompactLod1 as unknown as { $$typeof: symbol }).$$typeof;
    expect(typeof memoTypeof).toBe('symbol');
    expect(String(memoTypeof)).toBe('Symbol(react.memo)');
  });

  it('carries displayName "CompactLod1"', () => {
    expect((CompactLod1 as unknown as { displayName: string }).displayName).toBe('CompactLod1');
  });
});

describe('CompactLod1 — outer <g> attributes', () => {
  it('writes data-node-id from nodeId', () => {
    const tree = renderLod1({ nodeId: 'block-7' });
    expect((tree.props as { 'data-node-id': string })['data-node-id']).toBe('block-7');
  });

  it('cursor: crosshair when connectionDragState === "valid-target"', () => {
    const tree = renderLod1({ connectionDragState: 'valid-target' });
    expect((tree.props as { style: { cursor: string } }).style.cursor).toBe('crosshair');
  });

  it('cursor: move when connectionDragState is null / source / invalid', () => {
    for (const ds of [null, 'source', 'invalid-target'] as const) {
      const tree = renderLod1({ connectionDragState: ds });
      expect((tree.props as { style: { cursor: string } }).style.cursor).toBe('move');
    }
  });

  it('opacity drops to 0.3 when invalid-target', () => {
    const tree = renderLod1({ connectionDragState: 'invalid-target' });
    expect((tree.props as { opacity: number }).opacity).toBe(0.3);
  });

  it('opacity stays at 1 for valid / source / null', () => {
    for (const ds of ['valid-target', 'source', null] as const) {
      const tree = renderLod1({ connectionDragState: ds });
      expect((tree.props as { opacity: number }).opacity).toBe(1);
    }
  });

  it('forwards onMouseEnter / onMouseLeave to outer <g>', () => {
    const calls: string[] = [];
    const tree = renderLod1({
      onMouseEnter: () => calls.push('enter'),
      onMouseLeave: () => calls.push('leave'),
    });
    const props = tree.props as { onMouseEnter: () => void; onMouseLeave: () => void };
    props.onMouseEnter();
    props.onMouseLeave();
    expect(calls).toEqual(['enter', 'leave']);
  });
});

describe('CompactLod1 — inner card geometry / colors', () => {
  const findCard = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => el.type === 'div' && (el.props as { style?: { boxSizing?: string } }).style?.boxSizing === 'border-box')[0];

  it('inner border becomes #22c55e on valid-target', () => {
    const tree = renderLod1({ connectionDragState: 'valid-target', border: '#444' });
    const card = findCard(tree)!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #22c55e');
  });

  it('inner border uses border prop when not valid-target', () => {
    const tree = renderLod1({ border: '#abc' });
    const card = findCard(tree)!;
    expect((card.props as { style: { border: string } }).style.border).toBe('1px solid #abc');
  });

  it('selected: boxShadow uses categoryGlow', () => {
    const tree = renderLod1({ isSelected: true, categoryGlow: '#deadbe' });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toContain('#deadbe');
  });

  it('hovered (not selected): hover boxShadow', () => {
    const tree = renderLod1({ isSelected: false, isHovered: true });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 2px 8px -2px rgba(0,0,0,0.15)');
  });

  it('default: resting boxShadow', () => {
    const tree = renderLod1({ isSelected: false, isHovered: false });
    const card = findCard(tree)!;
    expect((card.props as { style: { boxShadow: string } }).style.boxShadow).toBe('0 1px 3px rgba(0,0,0,0.06)');
  });
});

describe('CompactLod1 — connection drag glow', () => {
  it('renders ConnectionDragGlow when valid-target', () => {
    const tree = renderLod1({ connectionDragState: 'valid-target' });
    expect(findByType(tree, MockConnectionDragGlow)).toHaveLength(1);
  });

  it('does NOT render ConnectionDragGlow for null / source / invalid', () => {
    for (const ds of [null, 'source', 'invalid-target'] as const) {
      const tree = renderLod1({ connectionDragState: ds });
      expect(findByType(tree, MockConnectionDragGlow)).toHaveLength(0);
    }
  });
});

describe('CompactLod1 — icon source priority', () => {
  it('uses brandIconUrl when set', () => {
    const tree = renderLod1({
      brandIconUrl: 'https://brand.example/icon.svg',
      providerUrl: 'https://provider.example/icon.svg',
    });
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://brand.example/icon.svg');
  });

  it('falls back to providerUrl when brandIconUrl is undefined', () => {
    const tree = renderLod1({ brandIconUrl: undefined, providerUrl: 'https://p.example/icon.svg' });
    const img = findByType(tree, 'img')[0];
    expect((img.props as { src: string }).src).toBe('https://p.example/icon.svg');
  });

  it('img alt uses label or i18n fallback when label empty', () => {
    const withLabel = renderLod1({ label: 'My Node' });
    const withoutLabel = renderLod1({ label: '' });
    expect((findByType(withLabel, 'img')[0].props as { alt: string }).alt).toBe('My Node');
    // i18n fallback string is non-empty (key exists)
    const fallbackAlt = (findByType(withoutLabel, 'img')[0].props as { alt: string }).alt;
    expect(typeof fallbackAlt).toBe('string');
    expect(fallbackAlt.length).toBeGreaterThan(0);
  });
});

describe('CompactLod1 — label rendering', () => {
  it('renders label text inside a span', () => {
    const tree = renderLod1({ label: 'Hello' });
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === 'Hello');
    expect(span).toHaveLength(1);
  });

  it('renders empty string when label empty', () => {
    const tree = renderLod1({ label: '' });
    const span = findByPredicate(tree, (el) => el.type === 'span' && (el.props as { children?: unknown }).children === '');
    expect(span.length).toBeGreaterThan(0);
  });
});

describe('CompactLod1 — status dot color + animation', () => {
  /** Find the dot span — width/height 12 + flexShrink 0 + opacity 0.9. */
  const findDot = (tree: React.ReactElement): React.ReactElement | undefined =>
    findByPredicate(tree, (el) => {
      if (el.type !== 'span') return false;
      const style = (el.props as { style?: { width?: number; height?: number; flexShrink?: number } }).style;
      return style?.width === 12 && style?.height === 12 && style?.flexShrink === 0;
    })[0];

  it('uses statusColor when no pipeline status', () => {
    const tree = renderLod1({ effectivePipelineStatus: null, statusColor: '#cafe22' });
    const dot = findDot(tree)!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#cafe22');
  });

  it('uses pipeline color (#22c55e) when status=success', () => {
    const ps: NodePipelineStatus = { status: 'success' };
    const dot = findDot(renderLod1({ effectivePipelineStatus: ps }))!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#22c55e');
  });

  it('uses pipeline color (#ef4444) when status=failed', () => {
    const ps: NodePipelineStatus = { status: 'failed' };
    const dot = findDot(renderLod1({ effectivePipelineStatus: ps }))!;
    expect((dot.props as { style: { background: string } }).style.background).toBe('#ef4444');
  });

  it('uses pipeline color (#3b82f6) when status=building/deploying/queued (in-flight)', () => {
    for (const s of ['building', 'deploying', 'queued'] as const) {
      const ps: NodePipelineStatus = { status: s };
      const dot = findDot(renderLod1({ effectivePipelineStatus: ps }))!;
      expect((dot.props as { style: { background: string } }).style.background).toBe('#3b82f6');
    }
  });

  it('animation pulses when in-flight + reducedMotion=false', () => {
    const ps: NodePipelineStatus = { status: 'building' };
    const dot = findDot(renderLod1({ effectivePipelineStatus: ps, reducedMotion: false }))!;
    expect((dot.props as { style: { animation?: string } }).style.animation).toContain('pulse-opacity');
  });

  it('animation off when reducedMotion=true', () => {
    const ps: NodePipelineStatus = { status: 'building' };
    const dot = findDot(renderLod1({ effectivePipelineStatus: ps, reducedMotion: true }))!;
    expect((dot.props as { style: { animation?: string } }).style.animation).toBeUndefined();
  });

  it('animation off when status=success or failed (terminal pipeline state)', () => {
    for (const s of ['success', 'failed'] as const) {
      const dot = findDot(renderLod1({ effectivePipelineStatus: { status: s }, reducedMotion: false }))!;
      expect((dot.props as { style: { animation?: string } }).style.animation).toBeUndefined();
    }
  });

  it('animation off when no pipeline status', () => {
    const dot = findDot(renderLod1({ effectivePipelineStatus: null, reducedMotion: false }))!;
    expect((dot.props as { style: { animation?: string } }).style.animation).toBeUndefined();
  });
});

describe('CompactLod1 — connection ports gating', () => {
  it('renders ConnectionPorts when isHovered', () => {
    const tree = renderLod1({ isHovered: true });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(1);
  });

  it('renders ConnectionPorts when valid-target', () => {
    const tree = renderLod1({ isHovered: false, connectionDragState: 'valid-target' });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(1);
  });

  it('omits ConnectionPorts when not hovered + no drag', () => {
    const tree = renderLod1({ isHovered: false, connectionDragState: null });
    expect(findByType(tree, MockConnectionPorts)).toHaveLength(0);
  });

  it('forwards isValidTarget=true when valid-target drag', () => {
    const tree = renderLod1({ isHovered: false, connectionDragState: 'valid-target' });
    const ports = findByType(tree, MockConnectionPorts)[0];
    expect((ports.props as { isValidTarget: boolean }).isValidTarget).toBe(true);
  });

  it('forwards isValidTarget=false when only hovered', () => {
    const tree = renderLod1({ isHovered: true, connectionDragState: null });
    const ports = findByType(tree, MockConnectionPorts)[0];
    expect((ports.props as { isValidTarget: boolean }).isValidTarget).toBe(false);
  });

  it('forwards sides=[left,right] to ConnectionPorts', () => {
    const tree = renderLod1({ isHovered: true });
    const ports = findByType(tree, MockConnectionPorts)[0];
    expect((ports.props as { sides: string[] }).sides).toEqual(['left', 'right']);
  });
});
