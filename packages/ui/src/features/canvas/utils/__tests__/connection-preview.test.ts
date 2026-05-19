/**
 * rf-canv-8 — pure regression for the connection-preview helpers.
 *
 * Two helpers, two behaviours pinned:
 *
 * `computeConnectionPreviewPath` builds the cubic-bezier `<path d>` string
 * for the in-flight connection drag overlay. The control-point dispatch is
 * dominant-axis: horizontal drags (`|dx| >= |dy|`) route the curve
 * left/right, vertical drags route up/down. The control-point offset is
 * `dist * 0.35` clamped to `[40, 200]`. The path-string format is verbatim
 * `M x1 y1 C cp1x cp1y, cp2x cp2y, x2 y2`.
 *
 * `pickPreviewColor` returns the stroke color based on what's under the
 * cursor. Iterates IN REVERSE so topmost-rendered nodes win, breaks on the
 * first AABB hit, skips the source node, returns one of cyan/green/red.
 * The reverse-iteration semantics (later index wins overlapping regions)
 * is load-bearing — the rf-canv-6 truth table flagged this site as a
 * distinct hit-test pattern.
 *
 * No React, no Redux — synthetic CanvasNode arrays + plain points.
 */

import { describe, it, expect } from 'vitest';

import type { CanvasNode } from '../../components/types';
import { computeConnectionPreviewPath, pickPreviewColor } from '../connection-preview';

/** Minimal CanvasNode factory — only the fields the helpers read. */
function node(id: string, x: number, y: number, width: number, height: number): CanvasNode {
  return {
    id,
    type: 'block',
    x,
    y,
    width,
    height,
    label: id,
    data: {},
  };
}

describe('computeConnectionPreviewPath', () => {
  it('uses horizontal control points when |dx| > |dy| (rightward drag)', () => {
    // dx = 300, dy = 50 — horizontal dominates, sign = +1, dist ≈ 304,
    // offset = min(max(304*0.35, 40), 200) ≈ 106.5.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 300, y: 50 });
    // cp1 should be horizontally offset from source on the same y as source.
    // cp2 should be horizontally offset from current on the same y as current.
    // Match shape: cp1 at (offset, 0); cp2 at (300 - offset, 50).
    expect(path).toMatch(/^M 0 0 C [\d.]+ 0, [\d.]+ 50, 300 50$/);
  });

  it('uses vertical control points when |dy| > |dx| (downward drag)', () => {
    // dx = 50, dy = 300 — vertical dominates, sign = +1.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 50, y: 300 });
    // cp1 at (0, offset); cp2 at (50, 300 - offset). Same x as endpoints.
    expect(path).toMatch(/^M 0 0 C 0 [\d.]+, 50 [\d.]+, 50 300$/);
  });

  it('uses horizontal control points when |dx| === |dy| (the >= branch)', () => {
    // dx = 100, dy = 100 — tie goes to horizontal because of `>=`.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 100, y: 100 });
    // Horizontal branch: cp1 keeps source.y, cp2 keeps current.y.
    expect(path).toMatch(/^M 0 0 C [\d.]+ 0, [\d.]+ 100, 100 100$/);
  });

  it('flips control-point sign for negative dx (leftward drag)', () => {
    // dx = -300, dy = 0 — horizontal dominates, sign = -1.
    // offset clamped to 200 (300 * 0.35 = 105, but max=200, so min(105,200)=105).
    // cp1 at (0 + 105*-1, 0) = (-105, 0); cp2 at (-300 - 105*-1, 0) = (-195, 0).
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: -300, y: 0 });
    expect(path).toBe('M 0 0 C -105 0, -195 0, -300 0');
  });

  it('flips control-point sign for negative dy (upward drag)', () => {
    // dx = 0, dy = -300 — vertical dominates, sign = -1.
    // offset = 105.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 0, y: -300 });
    expect(path).toBe('M 0 0 C 0 -105, 0 -195, 0 -300');
  });

  it('clamps offset to a minimum of 40 on tiny drags', () => {
    // dx = 1, dy = 0 — dist = 1, raw offset = 0.35, clamp lifts to 40.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 1, y: 0 });
    // cp1 at (0 + 40, 0); cp2 at (1 - 40, 0) = (-39, 0).
    expect(path).toBe('M 0 0 C 40 0, -39 0, 1 0');
  });

  it('clamps offset to a maximum of 200 on huge drags', () => {
    // dx = 10000, dy = 0 — raw offset = 3500, clamp drops to 200.
    const path = computeConnectionPreviewPath({ x: 0, y: 0 }, { x: 10000, y: 0 });
    expect(path).toBe('M 0 0 C 200 0, 9800 0, 10000 0');
  });

  it('emits the verbatim path-string format `M x1 y1 C cp1x cp1y, cp2x cp2y, x2 y2`', () => {
    // Use values that give exact (no floating-point noise) coordinates.
    // dx = 200, dy = 0 — dist = 200, offset = min(max(70, 40), 200) = 70.
    const path = computeConnectionPreviewPath({ x: 10, y: 20 }, { x: 210, y: 20 });
    expect(path).toBe('M 10 20 C 80 20, 140 20, 210 20');
  });
});

describe('pickPreviewColor', () => {
  const dragTargets = new Map<string, string>();

  it('returns cyan default when the cursor is in empty space', () => {
    const targets = new Map<string, string>([['n1', 'valid-target']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    // Cursor far outside any node.
    const color = pickPreviewColor({ x: 500, y: 500 }, nodes, 'src', targets);
    expect(color).toBe('#22d3ee');
  });

  it('returns green when the cursor is over a node with `valid-target` state', () => {
    const targets = new Map<string, string>([['n1', 'valid-target']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', targets);
    expect(color).toBe('#22c55e');
  });

  it('returns red when the cursor is over a node with `invalid-target` state', () => {
    const targets = new Map<string, string>([['n1', 'invalid-target']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', targets);
    expect(color).toBe('#ef4444');
  });

  it('returns red when the hit node has any non-`valid-target` state (e.g. `source`)', () => {
    // The verbatim ternary only returns green for the literal 'valid-target'
    // string — every other state value falls through to red.
    const targets = new Map<string, string>([['n1', 'source']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', targets);
    expect(color).toBe('#ef4444');
  });

  it('skips the source node — cursor over it returns the cyan default', () => {
    const targets = new Map<string, string>([['src', 'source']]);
    const nodes = [node('src', 0, 0, 100, 100)];
    // Cursor on top of the source itself; the loop's `if (node.id === sourceId) continue;`
    // skips it, no other nodes match, color stays default.
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', targets);
    expect(color).toBe('#22d3ee');
  });

  it('reverse-iteration semantics: when two nodes overlap, the LATER one in the array wins', () => {
    // Both nodes cover (50, 50). Node A is first, B is second. The reverse
    // loop visits B before A and breaks on the first hit — so B's state
    // determines the color. Pin this exact ordering.
    const targets = new Map<string, string>([
      ['a', 'valid-target'],
      ['b', 'invalid-target'],
    ]);
    const nodes = [node('a', 0, 0, 100, 100), node('b', 0, 0, 100, 100)];
    // B (invalid) wins — color is red, NOT green.
    expect(pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', targets)).toBe('#ef4444');

    // Swap the array order: A is now after B, so A (valid) wins — color is green.
    const swapped = [node('b', 0, 0, 100, 100), node('a', 0, 0, 100, 100)];
    expect(pickPreviewColor({ x: 50, y: 50 }, swapped, 'src', targets)).toBe('#22c55e');
  });

  it('returns cyan when dragTargets is null (no iteration runs)', () => {
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', null);
    expect(color).toBe('#22d3ee');
  });

  it('returns cyan when dragTargets is undefined (no iteration runs)', () => {
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', undefined);
    expect(color).toBe('#22d3ee');
  });

  it('returns red when dragTargets is empty Map and the cursor is over a node (no entry → undefined → not valid-target)', () => {
    // The loop runs (dragTargets is truthy), finds the hit, looks up — gets
    // `undefined`, which is not `'valid-target'`, so the ternary returns red.
    // This pins the verbatim behaviour: an empty Map is NOT the same as null.
    const nodes = [node('n1', 0, 0, 100, 100)];
    const color = pickPreviewColor({ x: 50, y: 50 }, nodes, 'src', new Map());
    expect(color).toBe('#ef4444');
  });

  it('returns cyan when dragTargets is empty Map and the cursor is in empty space', () => {
    const nodes = [node('n1', 0, 0, 100, 100)];
    // Cursor outside the node — no hit, no lookup, default color.
    const color = pickPreviewColor({ x: 500, y: 500 }, nodes, 'src', new Map());
    expect(color).toBe('#22d3ee');
  });

  it('counts the right edge as inside the hit-test rectangle (`<=` boundary)', () => {
    const targets = new Map<string, string>([['n1', 'valid-target']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    // currentPoint.x === node.x + node.width — the `<=` makes this a hit.
    const color = pickPreviewColor({ x: 100, y: 50 }, nodes, 'src', targets);
    expect(color).toBe('#22c55e');
  });

  it('counts the bottom edge as inside the hit-test rectangle (`<=` boundary)', () => {
    const targets = new Map<string, string>([['n1', 'valid-target']]);
    const nodes = [node('n1', 0, 0, 100, 100)];
    // currentPoint.y === node.y + node.height — the `<=` makes this a hit.
    const color = pickPreviewColor({ x: 50, y: 100 }, nodes, 'src', targets);
    expect(color).toBe('#22c55e');
  });

  // Sanity: dragTargets reference is unchanged.
  it('does not mutate dragTargets', () => {
    const before = JSON.stringify(Array.from(dragTargets.entries()));
    pickPreviewColor({ x: 50, y: 50 }, [node('n1', 0, 0, 100, 100)], 'src', dragTargets);
    const after = JSON.stringify(Array.from(dragTargets.entries()));
    expect(after).toBe(before);
  });
});
