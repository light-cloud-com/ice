/**
 * rf-conpath-4 — pin `buildStraightPath`'s SVG `d` output and
 * geometric midpoint. The path-d format is load-bearing: the
 * orchestrator hands it straight to a `<path d=...>` and to the
 * "invisible wider hover target" path next to it. Bytes must match
 * exactly.
 */

import { describe, it, expect } from 'vitest';
import { buildStraightPath } from '../straight';
import type { Point } from '../../types';

const p = (x: number, y: number): Point => ({ x, y });

describe('rf-conpath-4: buildStraightPath', () => {
  it('emits the verbatim `M ... L ...` SVG path-d byte format', () => {
    const out = buildStraightPath(p(0, 0), p(100, 50));
    expect(out.pathD).toBe('M 0 0 L 100 50');
  });

  it('midpoint is the geometric midpoint of the segment', () => {
    const out = buildStraightPath(p(10, 20), p(30, 40));
    expect(out.midX).toBe(20);
    expect(out.midY).toBe(30);
  });

  it('handles negative coordinates verbatim', () => {
    const out = buildStraightPath(p(-10, -20), p(10, 20));
    expect(out.pathD).toBe('M -10 -20 L 10 20');
    expect(out.midX).toBe(0);
    expect(out.midY).toBe(0);
  });

  it('handles fractional coordinates without rounding', () => {
    const out = buildStraightPath(p(1.5, 2.25), p(3, 4));
    expect(out.pathD).toBe('M 1.5 2.25 L 3 4');
    expect(out.midX).toBe(2.25);
    expect(out.midY).toBe(3.125);
  });

  it('handles a zero-length edge (start === end)', () => {
    const out = buildStraightPath(p(50, 50), p(50, 50));
    expect(out.pathD).toBe('M 50 50 L 50 50');
    expect(out.midX).toBe(50);
    expect(out.midY).toBe(50);
  });
});
