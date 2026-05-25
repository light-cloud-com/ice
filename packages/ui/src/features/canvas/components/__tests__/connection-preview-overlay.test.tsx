/**
 * `ConnectionPreviewOverlay` tests — new socket-to-socket behavior.
 *
 * The overlay now renders the in-flight preview ONLY when the magnet
 * has snapped to a compatible target port. Without a snap the preview
 * is `null` — the source-socket pulse + per-port halos elsewhere on
 * the canvas carry the feedback. This matches the "connections are
 * socket ↔ socket only" UX standard.
 */

import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';

import { ConnectionPreviewOverlay, type ConnectionPreviewOverlayProps } from '../connection-preview-overlay';
import {
  ConnectionDragProvider,
  _resetConnectionDragInfo,
  type ConnectionDragInfo,
} from '../nodes/_shared/connection-drag-context';

// ─── Tree-walker — same shape as the other rf-canv-* tests ───────────────────

function* walk(node: React.ReactNode): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as React.ReactNode);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

function findByType(tree: React.ReactNode, type: unknown): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  for (const el of walk(tree)) {
    if (el && el.type === type) out.push(el);
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseProps = (overrides: Partial<ConnectionPreviewOverlayProps> = {}): ConnectionPreviewOverlayProps => ({
  drawingConnection: {
    sourceId: 'src',
    sourcePoint: { x: 10, y: 20 },
    currentPoint: { x: 100, y: 80 },
  },
  effectiveNodes: [],
  connectionDragTargets: null,
  ...overrides,
});

/** Renders the overlay as a plain function, optionally seeding the drag context first. */
function render(
  overrides: Partial<ConnectionPreviewOverlayProps> = {},
  dragInfo: ConnectionDragInfo | null = null,
): React.ReactNode {
  // Seed the singleton via the provider's render so getConnectionDragInfo
  // sees the value when the overlay calls it.
  ConnectionDragProvider({ value: dragInfo, children: null });
  return ConnectionPreviewOverlay(baseProps(overrides));
}

beforeEach(() => {
  _resetConnectionDragInfo();
});

// ═══════════════════════════════════════════════════════════════════════════
// No snap → no preview
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — no snap target', () => {
  it('returns null when there is no active drag info (rest state)', () => {
    const tree = render({}, null);
    expect(tree).toBeNull();
  });

  it("returns null when a drag is in progress but the cursor isn't on a compatible port", () => {
    const tree = render(
      {},
      {
        sourceNodeId: 'src',
        sourcePortId: 'env-out',
        compatibleByNode: new Map([['tgt', new Set(['env-in'])]]),
        snap: null,
      },
    );
    expect(tree).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Snap → solid socket-to-socket line
// ═══════════════════════════════════════════════════════════════════════════

describe('ConnectionPreviewOverlay — snapped to target', () => {
  const snappedInfo: ConnectionDragInfo = {
    sourceNodeId: 'src',
    sourcePortId: 'env-out',
    compatibleByNode: new Map([['tgt', new Set(['env-in'])]]),
    snap: { nodeId: 'tgt', portId: 'env-in' },
  };

  it('renders an outer <g class="connection-preview"> wrapper', () => {
    const tree = render({}, snappedInfo);
    const wraps = findByType(tree, 'g');
    expect(wraps).toHaveLength(1);
    expect((wraps[0].props as { className?: string }).className).toBe('connection-preview');
  });

  it('renders exactly one <path> (no dashes — socket-to-socket is a solid promise)', () => {
    const tree = render({}, snappedInfo);
    const paths = findByType(tree, 'path');
    expect(paths).toHaveLength(1);
    const props = paths[0].props as { fill: string; stroke: string; strokeDasharray?: string };
    expect(props.fill).toBe('none');
    expect(props.stroke).toBe('#22c55e');
    expect(props.strokeDasharray).toBeUndefined();
  });

  it('renders two anchor circles (one at source, one at snapped endpoint)', () => {
    const tree = render({}, snappedInfo);
    const circles = findByType(tree, 'circle');
    expect(circles).toHaveLength(2);
  });

  it('disables pointer-events on the preview so it never blocks the drag', () => {
    const tree = render({}, snappedInfo);
    const wrap = findByType(tree, 'g')[0];
    expect((wrap.props as { style?: React.CSSProperties }).style?.pointerEvents).toBe('none');
  });
});
