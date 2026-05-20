/**
 * rf-conpath-6 — fixture tests for `buildRectangularPath`.
 *
 * Four side-combination branches × two corner-chamfer regimes:
 *
 *   Branches:
 *     A. right↔left / left↔right (horizontal-axis edge): elbow at
 *        `midX = (start.x + end.x) / 2`.
 *     B. bottom↔top / top↔bottom (vertical-axis edge): elbow at
 *        `midY = (start.y + end.y) / 2`.
 *     C. right/left exit + top/bottom entry (mixed): elbow at
 *        `outX = start.x ± GAP` (GAP=20).
 *     D. top/bottom exit + right/left entry (mixed fallback): elbow
 *        at `outY = start.y ± GAP` (GAP=20).
 *
 *   Chamfer regimes:
 *     - Long enough for an 8-unit chamfer: emits `L (before) Q (cur)
 *       (after)` triples.
 *     - Short corner: falls through to a plain `L (cur)`.
 *
 * Pin SVG bytes for the verbatim cases; use string-shape regexes for
 * the chamfer-math float cases. Midpoint always probes
 * `points[Math.floor(points.length / 2)]`.
 */

import { describe, it, expect } from 'vitest';
import { buildRectangularPath } from '../rectangular';
import type { Point } from '../../types';

const p = (x: number, y: number): Point => ({ x, y });

describe('rf-conpath-6: buildRectangularPath', () => {
  it('horizontal-axis (right→left): bends at midX', () => {
    // start=(0,0), end=(100,50). midX=50. points=[(0,0),(50,0),(50,50),(100,50)].
    // Two interior corners with chamfer at r=min(8, lenIn/2, lenOut/2)=8.
    const out = buildRectangularPath(p(0, 0), p(100, 50), 'right', 'left');
    expect(out.pathD).toMatch(/^M 0 0 L 42 0 Q 50 0 50 8 L 50 42 Q 50 50 58 50 L 100 50$/);
  });

  it('horizontal-axis (left→right): bends at midX', () => {
    // start=(100,0), end=(0,50). midX=50.
    // points=[(100,0),(50,0),(50,50),(0,50)]. Two interior corners.
    const out = buildRectangularPath(p(100, 0), p(0, 50), 'left', 'right');
    expect(out.pathD).toMatch(/^M 100 0 L 58 0 Q 50 0 50 8 L 50 42 Q 50 50 42 50 L 0 50$/);
  });

  it('vertical-axis (bottom→top): bends at midY', () => {
    // start=(0,0), end=(50,100). midY=50. points=[(0,0),(0,50),(50,50),(50,100)].
    const out = buildRectangularPath(p(0, 0), p(50, 100), 'bottom', 'top');
    expect(out.pathD).toMatch(/^M 0 0 L 0 42 Q 0 50 8 50 L 42 50 Q 50 50 50 58 L 50 100$/);
  });

  it('vertical-axis (top→bottom): bends at midY', () => {
    // start=(0,100), end=(50,0). midY=50.
    const out = buildRectangularPath(p(0, 100), p(50, 0), 'top', 'bottom');
    expect(out.pathD).toMatch(/^M 0 100 L 0 58 Q 0 50 8 50 L 42 50 Q 50 50 50 42 L 50 0$/);
  });

  it('mixed right→top: outX = start.x + GAP', () => {
    // GAP=20. start=(0,0), end=(100,100). outX=20.
    // points=[(0,0),(20,0),(20,100),(100,100)].
    const out = buildRectangularPath(p(0, 0), p(100, 100), 'right', 'top');
    // First corner at (20,0): lenIn=20, lenOut=100, r=min(8,10,50)=8.
    // before=(12,0), after=(20,8). Second corner at (20,100):
    // lenIn=100, lenOut=80, r=min(8,50,40)=8. before=(20,92), after=(28,100).
    expect(out.pathD).toBe('M 0 0 L 12 0 Q 20 0 20 8 L 20 92 Q 20 100 28 100 L 100 100');
  });

  it('mixed left→top: outX = start.x - GAP', () => {
    // GAP=20. start=(100,0), end=(0,100). outX=80.
    const out = buildRectangularPath(p(100, 0), p(0, 100), 'left', 'top');
    expect(out.pathD).toBe('M 100 0 L 88 0 Q 80 0 80 8 L 80 92 Q 80 100 72 100 L 0 100');
  });

  it('mixed bottom→right: outY = start.y + GAP (fallback branch)', () => {
    // The else-branch: top/bottom exit + left/right entry. GAP=20.
    // start=(0,0), end=(100,100). outY=20. points=[(0,0),(0,20),(100,20),(100,100)].
    const out = buildRectangularPath(p(0, 0), p(100, 100), 'bottom', 'right');
    expect(out.pathD).toBe('M 0 0 L 0 12 Q 0 20 8 20 L 92 20 Q 100 20 100 28 L 100 100');
  });

  it('mixed top→right: outY = start.y - GAP (fallback branch)', () => {
    // start=(0,100), end=(100,0). outY=80.
    const out = buildRectangularPath(p(0, 100), p(100, 0), 'top', 'right');
    expect(out.pathD).toBe('M 0 100 L 0 88 Q 0 80 8 80 L 92 80 Q 100 80 100 72 L 100 0');
  });

  it('emits a plain `L` when a corner is too short for an 8-unit chamfer', () => {
    // start=(0,0), end=(0.5,0.5). midX=0.25. points=[(0,0),(0.25,0),(0.25,0.5),(0.5,0.5)].
    // First corner: lenIn=0.25, lenOut=0.5, r=min(8,0.125,0.25)=0.125. r<1 → plain L.
    // Second corner: same shape mirrored → also plain L.
    const out = buildRectangularPath(p(0, 0), p(0.5, 0.5), 'right', 'left');
    expect(out.pathD).toBe('M 0 0 L 0.25 0 L 0.25 0.5 L 0.5 0.5');
  });

  it('midpoint = points[Math.floor(points.length / 2)] = points[2]', () => {
    // 4 waypoints → floor(4/2)=2 → mid = third point.
    // start=(0,0), end=(100,50). points[2] = {x:50, y:50}.
    const out = buildRectangularPath(p(0, 0), p(100, 50), 'right', 'left');
    expect(out.midX).toBe(50);
    expect(out.midY).toBe(50);
  });
});
