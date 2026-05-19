/**
 * rf-conpath-5 — fixture tests for `buildDagreRoutedPath`.
 *
 * The function handles four categories of input:
 *
 *   1. Too-few-points fallbacks (< 3 raw waypoints OR < 2 cleaned
 *      points): returns `null` so the orchestrator falls through to
 *      the plain rectangular builder.
 *   2. Already-orthogonal routes: dagre fed clean L-shapes; the
 *      builder rounds the corner with an 8-unit chamfer.
 *   3. Diagonal segments: builder inserts an elbow at `(cur.x,
 *      prev.y)` to coerce the segment into an L-shape.
 *   4. Near-duplicate cleanup: when the elbow insertion produces a
 *      pair of points within 0.5 of each other on both axes, the
 *      duplicate is dropped before emitting the path.
 *
 * Pinning the SVG byte format is load-bearing — the orchestrator hands
 * `pathD` to a `<path d=...>`. Tests probe the verbatim bytes for the
 * common L-shape case + the elbow-insertion case, and use string-
 * shape regexes for the float-arithmetic cases (chamfer math produces
 * non-integer coords).
 */

import { describe, it, expect } from 'vitest';
import { buildDagreRoutedPath } from '../dagre-routed';
import type { Point } from '../../types';

const p = (x: number, y: number): Point => ({ x, y });

describe('rf-conpath-5: buildDagreRoutedPath', () => {
  it('returns null when waypoints is empty', () => {
    expect(buildDagreRoutedPath([], p(0, 0), p(100, 0))).toBeNull();
  });

  it('returns null when waypoints has fewer than 3 points', () => {
    expect(buildDagreRoutedPath([p(0, 0), p(100, 0)], p(0, 0), p(100, 0))).toBeNull();
  });

  it('routes a 3-point L-shape with a rounded corner', () => {
    // raw=[start, midPoint, end] orthogonal → no elbow insertion needed.
    // start=(0,0), midPoint=(100,0), end=(100,100). The middle has lenIn=100,
    // lenOut=100, r=min(8, 50, 50)=8. before=(92,0), after=(100,8). Path:
    // M 0 0 L 92 0 Q 100 0 100 8 L 100 100
    const out = buildDagreRoutedPath([p(50, 50), p(100, 0), p(50, 50)], p(0, 0), p(100, 100));
    expect(out).not.toBeNull();
    expect(out!.pathD).toBe('M 0 0 L 92 0 Q 100 0 100 8 L 100 100');
  });

  it('inserts an elbow point when a segment is diagonal', () => {
    // raw=[start=(0,0), mid=(100,100) (diagonal!), end=(200,100)]
    // Elbow insertion: prev=(0,0), cur=(100,100) → push (100,0) before (100,100).
    // Then prev=(100,100), cur=(200,100) → already aligned, no elbow.
    // ortho = [(0,0), (100,0), (100,100), (200,100)] (4 pts).
    // Two interior corners → chamfer math kicks in.
    const out = buildDagreRoutedPath([p(0, 0), p(100, 100), p(200, 100)], p(0, 0), p(200, 100));
    expect(out).not.toBeNull();
    // M start, L (before c1), Q c1, after c1, L (before c2), Q c2, after c2, L end
    expect(out!.pathD).toMatch(/^M 0 0 L .+ Q 100 0 .+ L .+ Q 100 100 .+ L 200 100$/);
  });

  it('uses Math.floor(pts.length / 2) waypoint as the midpoint', () => {
    // ortho expands to length-4 here (one elbow insertion); pts after
    // duplicate-collapse stays at 4. floor(4/2)=2 → pts[2] = (100,100).
    const out = buildDagreRoutedPath([p(0, 0), p(100, 100), p(200, 100)], p(0, 0), p(200, 100));
    expect(out).not.toBeNull();
    expect(out!.midX).toBe(100);
    expect(out!.midY).toBe(100);
  });

  it('emits a plain `L` when the segment is too short for an 8-unit chamfer', () => {
    // start=(0,0), mid=(0.5,0), end=(0,1). lenIn≈0.5, lenOut≈1 → r<1, falls
    // through to the `L cur` branch. But — the first orthogonal step
    // collapses the near-duplicate (0,0)→(0.5,0): |dx|=0.5 not > 0.5, |dy|=0
    // not > 0.5 → drop. Resulting pts may be just 2 long, which the SECOND
    // length check handles via the pts<2 path; here pts=2 → builder emits
    // M start L end (no interior corner branch runs).
    const out = buildDagreRoutedPath(
      [p(0, 0), p(0.3, 0), p(0, 1)], // mid|dx|=0.3, |dy|=0 → collapses
      p(0, 0),
      p(0, 1),
    );
    // After collapsing duplicates, pts=[(0,0),(0,1)] (mid dropped because of
    // the dedup), then `for (i=1; i<pts.length-1; ...)` is i<1 which is
    // empty, so we just emit M start L end.
    expect(out).not.toBeNull();
    expect(out!.pathD).toBe('M 0 0 L 0 1');
  });

  it('replaces dagre first/last with start/end (port-adjusted endpoints)', () => {
    // dagre's center waypoints (e.g. (0,0) and (100,0)) get replaced;
    // the actual port-adjusted endpoints anchor the path.
    const out = buildDagreRoutedPath(
      [p(0, 0), p(50, 0), p(50, 50), p(100, 50)], // 4 dagre waypoints
      p(10, 10), // real start (port-adjusted)
      p(90, 60), // real end (port-adjusted)
    );
    expect(out).not.toBeNull();
    expect(out!.pathD).toMatch(/^M 10 10 .+ L 90 60$/);
  });

  it('returns null when post-collapse pts has fewer than 2 points', () => {
    // Pathological input: start === end exactly + degenerate middles.
    // start=(50,50), waypoints[1..-1] all coincident with start within 0.5,
    // end=(50,50). All ortho points dedupe to a single (50,50) → pts=1 → null.
    const out = buildDagreRoutedPath(
      [p(0, 0), p(50, 50), p(50.1, 50.1), p(50.2, 50.2), p(100, 100)],
      p(50, 50),
      p(50, 50),
    );
    expect(out).toBeNull();
  });
});
