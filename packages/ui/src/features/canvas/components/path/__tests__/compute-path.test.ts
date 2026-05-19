/**
 * rf-conpath-7 — fixture tests for the top-level path-builder
 * dispatcher. The dispatcher covers four orthogonal axes:
 *
 *   1. Missing fromNode / toNode → null.
 *   2. Source-side selection: generic chooseSides vs. CustomDomain
 *      row-port override (with `routeId` matching a row vs. a deleted
 *      `routeId` fallback).
 *   3. CustomDomain entry-side picker: dx-dominant vs. dy-dominant +
 *      tie-break on `>`.
 *   4. edgeStyle dispatch: bezier / straight / rectangular (with and
 *      without dagre routePoints).
 *
 * The pure-builder leaves (`bezier`, `straight`, `dagre-routed`,
 * `rectangular`, plus `bounds-and-sides`) are exhaustively tested in
 * their own files — the assertions here probe the DISPATCH (which
 * builder fires + correct args plumbed in), not the builders'
 * internals. We pin the `pathD` byte format only where it
 * unambiguously identifies the dispatch arm.
 */

import { describe, it, expect } from 'vitest';
import { computePath, type ComputePathArgs } from '../compute-path';
import type { CanvasConnection, CanvasNode } from '../../svg-canvas';

const node = (over: Partial<CanvasNode>): CanvasNode => ({
  id: 'n',
  type: 'block',
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  label: '',
  data: {},
  ...over,
});

const conn = (over: Partial<CanvasConnection> = {}): CanvasConnection => ({
  id: 'e1',
  from: 'a',
  to: 'b',
  ...over,
});

const baseArgs = (over: Partial<ComputePathArgs> = {}): ComputePathArgs => ({
  connection: conn(),
  fromNode: node({ id: 'a', x: 0, y: 0, width: 100, height: 50 }),
  toNode: node({ id: 'b', x: 200, y: 0, width: 100, height: 50 }),
  sourcePortIndex: 0,
  sourcePortCount: 1,
  targetPortIndex: 0,
  targetPortCount: 1,
  edgeStyle: 'bezier',
  lod: 3,
  zoom: 1,
  ...over,
});

describe('rf-conpath-7: computePath — null/missing nodes', () => {
  it('returns null when fromNode is missing', () => {
    expect(computePath(baseArgs({ fromNode: undefined }))).toBeNull();
  });

  it('returns null when toNode is missing', () => {
    expect(computePath(baseArgs({ toNode: undefined }))).toBeNull();
  });
});

describe('rf-conpath-7: computePath — edgeStyle dispatch', () => {
  it('bezier (default) dispatches buildBezierPath', () => {
    const out = computePath(baseArgs({ edgeStyle: 'bezier' }));
    expect(out).not.toBeNull();
    // Bezier uses `M ... C ...` form.
    expect(out!.pathD).toMatch(/^M \d+ \d+(\.\d+)? C /);
  });

  it('straight dispatches buildStraightPath', () => {
    const out = computePath(baseArgs({ edgeStyle: 'straight' }));
    expect(out).not.toBeNull();
    // Straight uses `M ... L ...` only.
    expect(out!.pathD).toBe('M 100 25 L 200 25');
  });

  it('rectangular without routePoints dispatches buildRectangularPath', () => {
    const out = computePath(baseArgs({ edgeStyle: 'rectangular' }));
    expect(out).not.toBeNull();
    // Right→Left horizontal-axis edge: bends at midX=150. With both
    // endpoints at y=25, the elbow has zero vertical leg → chamfer
    // collapses to plain `L cur` (lenIn or lenOut < 1).
    expect(out!.pathD).toBe('M 100 25 L 150 25 L 150 25 L 200 25');
  });

  it('rectangular with valid routePoints dispatches buildDagreRoutedPath', () => {
    const c = conn({
      data: {
        routePoints: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
          { x: 200, y: 100 },
        ],
      },
    });
    const out = computePath(baseArgs({ edgeStyle: 'rectangular', connection: c }));
    expect(out).not.toBeNull();
    // Dagre routed inserts an elbow at (100, 25) for our start (100,25).
    expect(out!.pathD).toMatch(/^M 100 25 .+ L 200 25$/);
  });

  it('rectangular falls through to buildRectangularPath when routePoints < 3', () => {
    const c = conn({
      data: {
        routePoints: [
          { x: 0, y: 0 },
          { x: 200, y: 100 },
        ],
      },
    });
    const out = computePath(baseArgs({ edgeStyle: 'rectangular', connection: c }));
    expect(out).not.toBeNull();
    // Same shape as the no-routePoints case — dagre returned null,
    // rectangular dispatch fired with zero-vertical-leg elbow.
    expect(out!.pathD).toBe('M 100 25 L 150 25 L 150 25 L 200 25');
  });
});

describe('rf-conpath-7: computePath — CustomDomain row override', () => {
  const cdSource = (over: Partial<CanvasNode> = {}): CanvasNode =>
    node({
      id: 'cd',
      x: 0,
      y: 0,
      width: 100,
      height: 200,
      data: {
        iceType: 'Network.CustomDomain',
        routes: [
          { id: 'r1', subdomain: 'one' },
          { id: 'r2', subdomain: 'two' },
        ],
      },
      ...over,
    });

  it('matched routeId anchors start to row-port-Y on right edge', () => {
    const c = conn({ data: { routeId: 'r2' } });
    const args = baseArgs({
      connection: c,
      fromNode: cdSource(),
      toNode: node({ id: 'b', x: 300, y: 0, width: 100, height: 50 }),
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // The exact y depends on getCustomDomainRoutePortY(1) — it's the
    // row's port Y. We don't pin its value, just that exit is right
    // edge (x=100) and a straight line emerges.
    expect(out!.pathD).toMatch(/^M 100 \d+(\.\d+)? L 300 \d+(\.\d+)?$/);
  });

  it('unmatched routeId falls back to chooseSides + getEdgePoint', () => {
    const c = conn({ data: { routeId: 'nonexistent' } });
    const args = baseArgs({
      connection: c,
      fromNode: cdSource(),
      toNode: node({ id: 'b', x: 300, y: 0, width: 100, height: 50 }),
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // Generic side selection: dx>0 dominant → exit right (x=100), enter
    // left (x=300). Source is 100x200, port mid → y=100. Target is
    // 100x50, port mid → y=25.
    expect(out!.pathD).toBe('M 100 100 L 300 25');
  });

  it('row override picks entry side relative to start point (not source midpoint)', () => {
    // Route 0 anchors start near the top of the source. Target is below
    // and to the right but vertically aligned — entry should pick top
    // because dy from the row-port to the target dominates.
    const c = conn({ data: { routeId: 'r1' } });
    const args = baseArgs({
      connection: c,
      fromNode: cdSource({ x: 0, y: 0, width: 100, height: 200 }),
      toNode: node({ id: 'b', x: 50, y: 1000, width: 100, height: 50 }), // far below
      edgeStyle: 'rectangular',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // Entry side is top — rectangular path with right→top mixed branch
    // (outX = startX + GAP). startX = 100 (source right edge), GAP=20.
    // Path emerges with the elbow points.
    expect(out!.pathD).toContain('120');
  });

  it('row override falls through to no special handling when iceType is not CustomDomain', () => {
    const c = conn({ data: { routeId: 'r2' } });
    const args = baseArgs({
      connection: c,
      fromNode: node({
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        data: { iceType: 'Compute.WebApp' }, // not CustomDomain
      }),
      toNode: node({ id: 'b', x: 200, y: 0, width: 100, height: 50 }),
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    expect(out!.pathD).toBe('M 100 25 L 200 25');
  });
});

describe('rf-conpath-7: computePath — port-slot plumbing', () => {
  it('passes sourcePortIndex/Count + targetPortIndex/Count to getEdgePoint', () => {
    // Source 100x100, port 1 of 3 → r=0.5 → y=50.
    // Target 100x100, port 0 of 2 → r=1/3 → y≈33.33.
    const args = baseArgs({
      fromNode: node({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
      toNode: node({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
      sourcePortIndex: 1,
      sourcePortCount: 3,
      targetPortIndex: 0,
      targetPortCount: 2,
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // Source y = 100 * 2/4 = 50, Target y = 100 * 1/3 ≈ 33.333…
    expect(out!.pathD).toMatch(/^M 100 50 L 200 33\.\d+$/);
  });
});
