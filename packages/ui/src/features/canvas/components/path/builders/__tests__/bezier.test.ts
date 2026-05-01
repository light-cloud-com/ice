/**
 * rf-conpath-3 — pin `buildBezierPath`'s SVG `d` output and midpoint
 * formula. The string format is load-bearing (the orchestrator hands
 * `pathD` straight to a `<path d=...>`), so the assertions check the
 * EXACT bytes — single-space separators, comma between control pairs,
 * no extra whitespace.
 *
 * The midpoint isn't the geometric arc midpoint — it's the cubic bezier
 * evaluated at `t=0.5`, computed in closed form. The orchestrator uses
 * it to place the edge label and bundle badge. Tests pin a few hand-
 * computed values to lock the formula.
 *
 * Offset clamping: `dist * 0.35` with a `[40, 200]` range. Pin all three
 * regimes:
 *   - tiny dist (e.g. 10 → clamped to 40),
 *   - mid dist  (e.g. 200 → 70),
 *   - huge dist (e.g. 1000 → clamped to 200).
 */

import { describe, it, expect } from 'vitest';
import { buildBezierPath } from '../bezier';
import type { Point } from '../../types';

const p = (x: number, y: number): Point => ({ x, y });

describe('rf-conpath-3: buildBezierPath', () => {
  it('emits the verbatim `M ... C ...` SVG path-d byte format', () => {
    const out = buildBezierPath(p(0, 0), p(100, 0), 'right', 'left');
    // dist=100, offset=Math.min(Math.max(100*0.35,40),200)=40 → cp1=(40,0), cp2=(60,0)
    expect(out.pathD).toBe('M 0 0 C 40 0, 60 0, 100 0');
  });

  it('midpoint is the cubic bezier evaluated at t=0.5', () => {
    const out = buildBezierPath(p(0, 0), p(100, 0), 'right', 'left');
    // 0.125*0 + 0.375*40 + 0.375*60 + 0.125*100 = 0 + 15 + 22.5 + 12.5 = 50
    expect(out.midX).toBe(50);
    expect(out.midY).toBe(0);
  });

  it('offset clamps to a 40 floor on short edges', () => {
    // dist=10 → 0.35*10=3.5 → clamped up to 40.
    const out = buildBezierPath(p(0, 0), p(10, 0), 'right', 'left');
    expect(out.pathD).toBe('M 0 0 C 40 0, -30 0, 10 0');
  });

  it('offset scales linearly in the mid range (40..200)', () => {
    // dist=200 → 0.35*200=70 → not clamped.
    const out = buildBezierPath(p(0, 0), p(200, 0), 'right', 'left');
    expect(out.pathD).toBe('M 0 0 C 70 0, 130 0, 200 0');
  });

  it('offset clamps to a 200 ceiling on long edges', () => {
    // dist=1000 → 0.35*1000=350 → clamped down to 200.
    const out = buildBezierPath(p(0, 0), p(1000, 0), 'right', 'left');
    expect(out.pathD).toBe('M 0 0 C 200 0, 800 0, 1000 0');
  });

  it('respects all four exit sides for the first control point', () => {
    const right = buildBezierPath(p(0, 0), p(100, 0), 'right', 'left');
    const left = buildBezierPath(p(0, 0), p(100, 0), 'left', 'left');
    const top = buildBezierPath(p(0, 0), p(100, 0), 'top', 'left');
    const bottom = buildBezierPath(p(0, 0), p(100, 0), 'bottom', 'left');
    // offset=40 across all (dist=100). cp1 differs by side:
    expect(right.pathD).toContain('C 40 0,');
    expect(left.pathD).toContain('C -40 0,');
    expect(top.pathD).toContain('C 0 -40,');
    expect(bottom.pathD).toContain('C 0 40,');
  });

  it('respects all four entry sides for the second control point', () => {
    const left = buildBezierPath(p(0, 0), p(100, 0), 'right', 'left');
    const right = buildBezierPath(p(0, 0), p(100, 0), 'right', 'right');
    const top = buildBezierPath(p(0, 0), p(100, 0), 'right', 'top');
    const bottom = buildBezierPath(p(0, 0), p(100, 0), 'right', 'bottom');
    // cp2 = end ± offset on the named axis (offset=40, end=(100,0))
    expect(left.pathD).toContain('60 0, 100 0');
    expect(right.pathD).toContain('140 0, 100 0');
    expect(top.pathD).toContain('100 -40, 100 0');
    expect(bottom.pathD).toContain('100 40, 100 0');
  });

  it('handles vertical edges (top→bottom)', () => {
    const out = buildBezierPath(p(50, 0), p(50, 100), 'bottom', 'top');
    // dist=100, offset=40
    expect(out.pathD).toBe('M 50 0 C 50 40, 50 60, 50 100');
    expect(out.midX).toBe(50);
    expect(out.midY).toBe(50);
  });

  it('handles a diagonal edge (right→left, end above start)', () => {
    const out = buildBezierPath(p(0, 100), p(100, 0), 'right', 'left');
    // dist = sqrt(100^2 + 100^2) ≈ 141.42 → 0.35*141.42 ≈ 49.49 → not clamped
    // cp1 = (49.5, 100), cp2 = (50.5, 0)  (approx)
    expect(out.pathD).toMatch(/^M 0 100 C [\d.]+ 100, [\d.]+ 0, 100 0$/);
  });
});
