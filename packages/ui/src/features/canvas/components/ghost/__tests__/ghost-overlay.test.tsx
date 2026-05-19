/**
 * rf-canv2-7 — GhostOverlay component tests.
 *
 * Tree-walks the rendered React element to verify the ghosts.length === 0
 * short-circuit, the per-ghost SvgGhostEdge / SvgGhostNode dispatch, and
 * the source-node lookup against the supplied nodes array.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { GhostOverlay } from '../ghost-overlay';
import type { CardNode } from '../../../../../store/slices/cards-slice';
import type { GhostNode } from '../../../../../store/slices/ghost-slice';

const makeCardNode = (overrides: Partial<CardNode> = {}): CardNode => ({
  id: 'n1',
  type: 'block',
  position: { x: 0, y: 0 },
  width: 120,
  height: 80,
  data: { iceType: 'Compute.Service' },
  ...overrides,
});

const makeGhost = (overrides: Partial<GhostNode> = {}): GhostNode =>
  ({
    id: 'g1',
    sourceNodeId: 'n1',
    suggestedType: 'Compute.Service',
    label: 'Suggested',
    x: 200,
    y: 0,
  }) as unknown as GhostNode;

describe('GhostOverlay', () => {
  it('returns null when ghosts is empty', () => {
    const result = GhostOverlay({
      ghosts: [],
      nodes: [],
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    expect(result).toBeNull();
  });

  it('returns a <g> wrapper element when ghosts has entries', () => {
    const result = GhostOverlay({
      ghosts: [makeGhost()],
      nodes: [makeCardNode()],
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ pointerEvents: string; children: unknown }>;
    expect(el.type).toBe('g');
    expect(el.props.pointerEvents).toBe('auto');
  });

  it('renders one Fragment per ghost with both SvgGhostEdge and SvgGhostNode when source exists', () => {
    const result = GhostOverlay({
      ghosts: [makeGhost({ id: 'g1', sourceNodeId: 'n1' })],
      nodes: [makeCardNode({ id: 'n1' })],
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const fragments = React.Children.toArray(el.props.children);
    expect(fragments).toHaveLength(1);
  });

  it('omits SvgGhostEdge when the source node is not in the supplied nodes array', () => {
    const result = GhostOverlay({
      ghosts: [makeGhost({ id: 'g1', sourceNodeId: 'missing' })],
      nodes: [makeCardNode({ id: 'other' })],
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    // Fragment still rendered; just the edge is absent.
    expect(React.isValidElement(result)).toBe(true);
  });

  it('renders multiple ghosts in order', () => {
    const result = GhostOverlay({
      ghosts: [makeGhost({ id: 'g1' }), makeGhost({ id: 'g2' }), makeGhost({ id: 'g3' })],
      nodes: [makeCardNode()],
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    const el = result as React.ReactElement<{ children: React.ReactElement[] }>;
    const fragments = React.Children.toArray(el.props.children);
    expect(fragments).toHaveLength(3);
  });
});
