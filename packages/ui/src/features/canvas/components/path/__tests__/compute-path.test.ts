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

describe('socket-aware magnetic routing', () => {
  it('uses the socket sides from edge.data when sockets exist', () => {
    // Postgres source (Database.PostgreSQL) with `traffic-out`? No —
    // Postgres has only `traffic-in` by default. Use Backend with
    // `traffic-out` on the right side.
    const from = node({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Compute.Worker' },
    });
    const to = node({
      id: 'b',
      x: 300,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Database.PostgreSQL' },
    });
    const result = computePath(
      baseArgs({
        connection: conn({ data: { sourceSocket: 'traffic-out', targetSocket: 'traffic-in' } }),
        fromNode: from,
        toNode: to,
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.exitSide).toBe('right');
    expect(result!.entrySide).toBe('left');
    expect(result!.start?.x).toBe(100); // right edge of source
    expect(result!.end?.x).toBe(300); // left edge of target
  });

  it('migrates the attach side when the target is in the opposite half-plane', () => {
    // Source on the right of canvas, target FAR LEFT — preferred socket
    // side is right, but target is left → attach migrates to left.
    const from = node({
      id: 'a',
      x: 500,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Compute.Worker' },
    });
    const to = node({
      id: 'b',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Database.PostgreSQL' },
    });
    const result = computePath(
      baseArgs({
        connection: conn({ data: { sourceSocket: 'traffic-out', targetSocket: 'traffic-in' } }),
        fromNode: from,
        toNode: to,
      }),
    );
    expect(result).not.toBeNull();
    // Source's preferred = right, but target is to the left → migrate to left.
    expect(result!.exitSide).toBe('left');
    expect(result!.start?.x).toBe(500); // left edge of source (at x=500)
  });

  it('falls back to chooseSides when neither socket id is set', () => {
    const from = node({ id: 'a', x: 0, y: 0, width: 100, height: 50, data: {} });
    const to = node({ id: 'b', x: 300, y: 0, width: 100, height: 50, data: {} });
    const result = computePath(
      baseArgs({
        connection: conn({ data: {} }),
        fromNode: from,
        toNode: to,
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.exitSide).toBe('right');
    expect(result!.entrySide).toBe('left');
  });

  it('falls back to chooseSides when a socket id is set but the socket no longer exists', () => {
    const from = node({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Compute.Worker' },
    });
    const to = node({
      id: 'b',
      x: 300,
      y: 0,
      width: 100,
      height: 50,
      data: { iceType: 'Database.PostgreSQL' },
    });
    const result = computePath(
      baseArgs({
        connection: conn({ data: { sourceSocket: 'nonexistent', targetSocket: 'nonexistent' } }),
        fromNode: from,
        toNode: to,
      }),
    );
    // Dangling sockets → graceful fallback to chooseSides, never null.
    expect(result).not.toBeNull();
    expect(result!.exitSide).toBe('right');
    expect(result!.entrySide).toBe('left');
  });
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

  it('unmatched routeId — sourceSocket inference still resolves a CD row anchor', () => {
    // Pre-unification this test exercised a legacy "row override
    // fallback" branch. In the unified model, an edge without an
    // explicit `sourceSocket` runs through `inferEdgePorts`, which on
    // a Network.CustomDomain with routes picks one of the `domain-out-{id}`
    // ports. The wire anchors at that port's bespoke row Y via
    // `getSocketCanvasPosition`, not at the generic side midpoint.
    const c = conn({ data: { routeId: 'nonexistent' } });
    const args = baseArgs({
      connection: c,
      fromNode: cdSource(),
      toNode: node({ id: 'b', x: 300, y: 0, width: 100, height: 50 }),
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // Source exit is the CD's right edge (x=100); the Y is row-anchored
    // (matches `getCustomDomainRoutePortY`) — we don't pin the exact
    // value because it changes with row-height constants.
    expect(out!.pathD).toMatch(/^M 100 \d+(\.\d+)? L 300 \d+(\.\d+)?$/);
  });

  it('legacy edge with no socket info on non-CustomDomain falls through to side-midpoint routing', () => {
    const c = conn({ data: { routeId: 'r2' } });
    const args = baseArgs({
      connection: c,
      fromNode: node({
        id: 'a',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        data: { iceType: 'Compute.WebApp' }, // not CustomDomain, no schema entry
      }),
      toNode: node({ id: 'b', x: 200, y: 0, width: 100, height: 50 }),
      edgeStyle: 'straight',
    });
    const out = computePath(args);
    expect(out).not.toBeNull();
    // Without typed sockets on either end, the path falls through to
    // chooseSides + magnetic-attach. Both 100x50 blocks have port-Y
    // clamped to the corner margin (12px), so y=25 (midpoint) or
    // clamped value — we just check the X anchors are on the inner
    // edges.
    expect(out!.pathD).toMatch(/^M 100 \d+(\.\d+)? L 200 \d+(\.\d+)?$/);
  });
});
