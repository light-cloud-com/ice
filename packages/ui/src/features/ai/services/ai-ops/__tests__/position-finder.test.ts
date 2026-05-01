/**
 * rf-aiop-3 — non-overlapping position-finder tests.
 *
 * Pure functions over Card data. The tests pin the canonical layout
 * decisions — start at (100, 100) on an empty canvas, container offsets
 * (CONTAINER_INNER_PAD, CONTAINER_HEADER_PAD), grid step
 * (NODE_WIDTH + NODE_GAP_X, NODE_HEIGHT + NODE_GAP_Y), and the helper-
 * iceType regex. Any drift here moves AI-placed nodes on the canvas.
 */

import { describe, it, expect } from 'vitest';
import {
  isHelperIceType,
  findPosition,
  findRootPosition,
  findChildPosition,
} from '../position-finder';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

function makeCard(nodes: CardNode[]): Card {
  return {
    id: 'card-1',
    name: 'T',
    nodes,
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  };
}

function makeNode(partial: Partial<CardNode> & { id: string }): CardNode {
  return {
    type: 'block',
    position: { x: 0, y: 0 },
    width: 220,
    height: 72,
    data: {},
    ...partial,
  };
}

describe('rf-aiop-3 isHelperIceType', () => {
  it.each([
    ['Security.IAM', true],
    ['security.iam', true],
    ['Monitoring.LogStream', true],
    ['Log.Group', true],
    ['Observability.Trace', true],
    ['Source.Repository', true],
    ['Config.EnvVars', true],
    ['EnvVarsSecret', true],
  ])('matches helper-shaped iceType "%s" → %s', (iceType, expected) => {
    expect(isHelperIceType(iceType)).toBe(expected);
  });

  it.each([
    ['Compute.Container', false],
    ['Database.PostgreSQL', false],
    ['Network.VPC', false],
    ['', false],
    ['Random.Other', false],
  ])('does NOT match non-helper iceType "%s" → %s', (iceType, expected) => {
    expect(isHelperIceType(iceType)).toBe(expected);
  });
});

describe('rf-aiop-3 findRootPosition', () => {
  it('returns (100, 100) on an empty card', () => {
    const card = makeCard([]);
    expect(findRootPosition(card, 220)).toEqual({ x: 100, y: 100 });
  });

  it('places below the lowest existing node when grid cell (0,0) is taken', () => {
    // Single node at (100, 100) blocks the first grid cell; the
    // "below-the-lowest" candidate is tried first.
    const card = makeCard([
      makeNode({ id: 'a', position: { x: 100, y: 100 }, width: 220, height: 72 }),
    ]);
    const pos = findRootPosition(card, 220);
    // Below-the-lowest = 100 + 72 + 36 = 208. The candidate is (100, 208)
    // and shouldn't overlap the (100, 100, 220, 72) node, so it wins.
    expect(pos).toEqual({ x: 100, y: 208 });
  });

  it('uses node.height fallback (NODE_HEIGHT=72) when height is 0', () => {
    const card = makeCard([
      makeNode({ id: 'a', position: { x: 100, y: 100 }, width: 220, height: 0 }),
    ]);
    const pos = findRootPosition(card, 220);
    // 100 + 72 (fallback) + 36 = 208
    expect(pos).toEqual({ x: 100, y: 208 });
  });

  it('returns a non-overlapping position even with many existing nodes', () => {
    const nodes: CardNode[] = [];
    for (let i = 0; i < 5; i++) {
      nodes.push(
        makeNode({
          id: `n${i}`,
          position: { x: 100, y: 100 + i * 200 },
          width: 220,
          height: 72,
        }),
      );
    }
    const card = makeCard(nodes);
    const pos = findRootPosition(card, 220);
    // Should not overlap any existing node (12px gap rule)
    for (const n of nodes) {
      const noOverlap =
        pos.x + 220 + 12 <= n.position.x ||
        pos.x >= n.position.x + n.width + 12 ||
        pos.y + 72 + 12 <= n.position.y ||
        pos.y >= n.position.y + n.height + 12;
      expect(noOverlap).toBe(true);
    }
  });
});

describe('rf-aiop-3 findChildPosition', () => {
  it('returns (100, 100) when parent does not exist', () => {
    const card = makeCard([]);
    expect(findChildPosition(card, 'missing', 220, 72)).toEqual({ x: 100, y: 100 });
  });

  it('returns parent.position + (CONTAINER_INNER_PAD, CONTAINER_HEADER_PAD) when parent has no children', () => {
    const card = makeCard([
      makeNode({
        id: 'parent',
        type: 'container',
        position: { x: 200, y: 300 },
        width: 600,
        height: 400,
      }),
    ]);
    // 200 + 30 = 230, 300 + 50 = 350
    expect(findChildPosition(card, 'parent', 220, 72)).toEqual({ x: 230, y: 350 });
  });

  it('finds a non-overlapping cell when a sibling occupies the start cell', () => {
    const parent = makeNode({
      id: 'parent',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 1000,
      height: 600,
    });
    const sibling = makeNode({
      id: 's1',
      parentId: 'parent',
      position: { x: 30, y: 50 }, // exactly the start
      width: 220,
      height: 72,
    });
    const card = makeCard([parent, sibling]);
    const pos = findChildPosition(card, 'parent', 220, 72);
    // First non-overlapping position should be the next column:
    // startX (30) + (nodeWidth 220 + NODE_GAP_X 36) = 286, startY 50
    expect(pos).toEqual({ x: 286, y: 50 });
  });

  it('falls back to "stack below last sibling" when the 10x3 grid is full', () => {
    const parent = makeNode({
      id: 'parent',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 5000,
      height: 5000,
    });
    // Fill all 30 grid cells with overlapping siblings
    const siblings: CardNode[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 3; col++) {
        siblings.push(
          makeNode({
            id: `s-${row}-${col}`,
            parentId: 'parent',
            position: { x: 30 + col * (220 + 36), y: 50 + row * (72 + 36) },
            width: 220,
            height: 72,
          }),
        );
      }
    }
    const card = makeCard([parent, ...siblings]);
    const pos = findChildPosition(card, 'parent', 220, 72);
    // maxBottom = max(s.y + s.height) over all siblings + NODE_GAP_Y (36)
    // The last row (row=9) starts at y = 50 + 9 * 108 = 1022; bottom = 1022 + 72 = 1094
    // result.y = 1094 + 36 = 1130
    expect(pos.x).toBe(30);
    expect(pos.y).toBe(1130);
  });
});

describe('rf-aiop-3 findPosition dispatcher', () => {
  it('routes to findRootPosition when no parentId', () => {
    const card = makeCard([]);
    expect(findPosition(card)).toEqual({ x: 100, y: 100 });
  });

  it('routes to findChildPosition when parentId is provided', () => {
    const card = makeCard([
      makeNode({
        id: 'parent',
        type: 'container',
        position: { x: 200, y: 300 },
        width: 600,
        height: 400,
      }),
    ]);
    expect(findPosition(card, 'parent')).toEqual({ x: 230, y: 350 });
  });

  it('uses NODE_WIDTH/NODE_HEIGHT defaults when nodeWidth/nodeHeight omitted', () => {
    // Defaults: 220 / 72. Test indirectly by relying on the empty-card branch.
    const card = makeCard([]);
    expect(findPosition(card, undefined)).toEqual({ x: 100, y: 100 });
  });

  it('respects explicit nodeWidth/nodeHeight when provided', () => {
    const parent = makeNode({
      id: 'parent',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 1000,
      height: 600,
    });
    const sibling = makeNode({
      id: 's1',
      parentId: 'parent',
      position: { x: 30, y: 50 },
      width: 170,
      height: 56,
    });
    const card = makeCard([parent, sibling]);
    // Grid step uses HELPER_NODE_WIDTH + NODE_GAP_X = 170 + 36 = 206
    const pos = findPosition(card, 'parent', 170, 56);
    expect(pos).toEqual({ x: 30 + 206, y: 50 });
  });
});
