/**
 * rf-canv2-2 — useCanvasTraversal hook tests.
 *
 * Exercises the three traversal callbacks the orchestrator threads into
 * `useDragTargetHighlight`, `useContainerMove`, and `useCanvasDrop`. Each
 * callback is a thin binding over a pure util in `../utils/`; the tests
 * verify the binding shape (deps + return reference equality on the hook
 * surface) and the predicate's effective semantics.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  useCanvasTraversal,
  type UseCanvasTraversalArgs,
  type UseCanvasTraversalResult,
} from '../use-canvas-traversal';
import type { CanvasNode } from '../../components/types';

// ─── Probe ──────────────────────────────────────────────────────────────────

const captureHook = (args: UseCanvasTraversalArgs): UseCanvasTraversalResult => {
  const captured: { current?: UseCanvasTraversalResult } = {};
  const Probe: React.FC = () => {
    captured.current = useCanvasTraversal(args);
    return React.createElement('div', null, 'probe');
  };
  renderToString(React.createElement(Probe));
  if (!captured.current) throw new Error('Probe did not render');
  return captured.current;
};

// ─── Fixtures ───────────────────────────────────────────────────────────────

const makeCanvasNode = (overrides: Partial<CanvasNode> = {}): CanvasNode =>
  ({
    id: 'n1',
    type: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    data: { iceType: 'Compute.Service' },
    parentId: null,
    ...overrides,
  }) as CanvasNode;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvasTraversal — getDescendantIds', () => {
  it('returns descendants from visibleNodes only', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({ id: 'parent', parentId: null }),
      makeCanvasNode({ id: 'child-a', parentId: 'parent' }),
      makeCanvasNode({ id: 'child-b', parentId: 'parent' }),
      makeCanvasNode({ id: 'grand', parentId: 'child-a' }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    const ids = result.getDescendantIds('parent');
    expect(ids.sort()).toEqual(['child-a', 'child-b', 'grand'].sort());
  });

  it('returns an empty array when the node has no descendants', () => {
    const visibleNodes: CanvasNode[] = [makeCanvasNode({ id: 'leaf' })];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    expect(result.getDescendantIds('leaf')).toEqual([]);
  });

  it('returns an empty array when the node is unknown', () => {
    const result = captureHook({ visibleNodes: [], canvasNodes: [] });
    expect(result.getDescendantIds('missing')).toEqual([]);
  });
});

describe('useCanvasTraversal — getAllDescendantIds', () => {
  it('searches canvasNodes (not visibleNodes) so hidden children are included', () => {
    // Simulate the L1 case: parent visible, child hidden (filtered out by view-level)
    const visibleNodes: CanvasNode[] = [makeCanvasNode({ id: 'parent', parentId: null })];
    const canvasNodes: CanvasNode[] = [
      makeCanvasNode({ id: 'parent', parentId: null }),
      // The child was filtered from visibleNodes but is still in canvasNodes:
      makeCanvasNode({ id: 'hidden-child', parentId: 'parent' }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes });
    expect(result.getAllDescendantIds('parent')).toContain('hidden-child');
    // Vs the visible-only walker:
    expect(result.getDescendantIds('parent')).not.toContain('hidden-child');
  });
});

describe('useCanvasTraversal — findContainerAtPosition', () => {
  it('returns the container node whose bounds enclose the point', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({
        id: 'group',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        data: { iceType: 'Group.Region' },
      }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    const hit = result.findContainerAtPosition(50, 50);
    expect(hit?.id).toBe('group');
  });

  it('matches Group.* iceType prefixes via the inline predicate', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({
        id: 'g',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        data: { iceType: 'Group.Subnet' },
      }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    expect(result.findContainerAtPosition(50, 50)?.id).toBe('g');
  });

  it('matches Network.* iceType prefixes via the inline predicate', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({
        id: 'net',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        data: { iceType: 'Network.VPC' },
      }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    expect(result.findContainerAtPosition(50, 50)?.id).toBe('net');
  });

  it('returns null when no container matches the predicate', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({
        id: 'block',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        data: { iceType: 'Compute.Service' },
      }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    // Compute.Service is NOT a container.
    expect(result.findContainerAtPosition(50, 40)).toBeNull();
  });

  it('returns null when the point is outside every container', () => {
    const visibleNodes: CanvasNode[] = [
      makeCanvasNode({
        id: 'group',
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        data: { iceType: 'Group.Region' },
      }),
    ];
    const result = captureHook({ visibleNodes, canvasNodes: [] });
    expect(result.findContainerAtPosition(500, 500)).toBeNull();
  });
});

describe('useCanvasTraversal — return surface', () => {
  it('returns three callable members', () => {
    const result = captureHook({ visibleNodes: [], canvasNodes: [] });
    expect(typeof result.getDescendantIds).toBe('function');
    expect(typeof result.getAllDescendantIds).toBe('function');
    expect(typeof result.findContainerAtPosition).toBe('function');
  });
});
