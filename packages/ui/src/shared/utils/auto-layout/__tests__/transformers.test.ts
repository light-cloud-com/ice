/**
 * Coordinate transformers — pure mutators on the relPos / containerSize /
 * nodeMap data structures. Tests verify the offset arithmetic
 * (absolutizeEdgeRoutes / absolutizeAll) and the snap rounding (snapToGrid).
 */

import { describe, it, expect } from 'vitest';
import { absolutizeEdgeRoutes, absolutizeAll, snapToGrid } from '../transformers';
import type { LayoutNode, Point } from '../types';

const GRID_STEP = 40;

function mk(id: string, x = 0, y = 0, width = 240, height = 160): LayoutNode {
  return {
    id,
    type: 'resource',
    iceType: 'Compute.Container',
    label: id,
    x,
    y,
    width,
    height,
    data: {},
  };
}

describe('absolutizeEdgeRoutes', () => {
  it('top-level (ownerId=null) routes pass through unmodified', () => {
    const nodeMap = new Map<string, LayoutNode>();
    const result = absolutizeEdgeRoutes(
      [
        {
          ownerId: null,
          key: 'a::b',
          points: [
            { x: 10, y: 20 },
            { x: 30, y: 40 },
          ],
        },
      ],
      nodeMap,
    );
    expect(result.get('a::b')).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });

  it('container-owned routes get offset by owner.x / owner.y', () => {
    const owner = mk('owner', 100, 200);
    const nodeMap = new Map([['owner', owner]]);
    const result = absolutizeEdgeRoutes(
      [
        {
          ownerId: 'owner',
          key: 'c1::c2',
          points: [
            { x: 5, y: 5 },
            { x: 15, y: 25 },
          ],
        },
      ],
      nodeMap,
    );
    expect(result.get('c1::c2')).toEqual([
      { x: 105, y: 205 },
      { x: 115, y: 225 },
    ]);
  });

  it('multiple routes with different owners each offset independently', () => {
    const o1 = mk('o1', 100, 0);
    const o2 = mk('o2', 0, 200);
    const nodeMap = new Map([
      ['o1', o1],
      ['o2', o2],
    ]);
    const result = absolutizeEdgeRoutes(
      [
        { ownerId: 'o1', key: 'p::q', points: [{ x: 10, y: 10 }] },
        { ownerId: 'o2', key: 'r::s', points: [{ x: 10, y: 10 }] },
      ],
      nodeMap,
    );
    expect(result.get('p::q')).toEqual([{ x: 110, y: 10 }]);
    expect(result.get('r::s')).toEqual([{ x: 10, y: 210 }]);
  });

  it('owner missing from nodeMap: route passes through with no offset', () => {
    const nodeMap = new Map<string, LayoutNode>();
    const result = absolutizeEdgeRoutes([{ ownerId: 'ghost', key: 'a::b', points: [{ x: 10, y: 20 }] }], nodeMap);
    expect(result.get('a::b')).toEqual([{ x: 10, y: 20 }]);
  });

  it('returns a fresh Map (does not mutate input)', () => {
    const input: Array<{ ownerId: string | null; key: string; points: Point[] }> = [
      { ownerId: null, key: 'a::b', points: [{ x: 1, y: 2 }] },
    ];
    const result = absolutizeEdgeRoutes(input, new Map());
    expect(result).toBeInstanceOf(Map);
    // The points objects should also be fresh (not aliased).
    const out = result.get('a::b')!;
    expect(out[0]).not.toBe(input[0].points[0]);
  });

  it('empty input → empty Map', () => {
    expect(absolutizeEdgeRoutes([], new Map()).size).toBe(0);
  });
});

describe('snapToGrid', () => {
  it('rounds x/y to nearest GRID_STEP', () => {
    const a = mk('a', 23, 56, 240, 160);
    const map = new Map([['a', a]]);
    snapToGrid(map);
    // 23 / 40 → 0.575 → round → 1 → 40
    // 56 / 40 → 1.4 → round → 1 → 40
    expect(a.x).toBe(40);
    expect(a.y).toBe(40);
  });

  it('rounds 21 to 40 and 19 to 0', () => {
    const a = mk('a', 21, 19);
    const map = new Map([['a', a]]);
    snapToGrid(map);
    expect(a.x).toBe(40);
    expect(a.y).toBe(0);
  });

  it('rounds width/height with a GRID_STEP floor', () => {
    const a = mk('a', 0, 0, 5, 5);
    const map = new Map([['a', a]]);
    snapToGrid(map);
    // 5/40 = 0.125 → round → 0 → snap=0; floor to GRID_STEP.
    expect(a.width).toBe(GRID_STEP);
    expect(a.height).toBe(GRID_STEP);
  });

  it('preserves already-on-grid values', () => {
    const a = mk('a', 80, 120, 240, 160);
    const map = new Map([['a', a]]);
    snapToGrid(map);
    expect(a.x).toBe(80);
    expect(a.y).toBe(120);
    expect(a.width).toBe(240);
    expect(a.height).toBe(160);
  });

  it('processes every node in the map', () => {
    const a = mk('a', 1, 1);
    const b = mk('b', 41, 41);
    const c = mk('c', 81, 81);
    const map = new Map([
      ['a', a],
      ['b', b],
      ['c', c],
    ]);
    snapToGrid(map);
    expect(a.x).toBe(0);
    expect(b.x).toBe(40);
    expect(c.x).toBe(80);
  });

  it('mutates entries in place (no new map allocated)', () => {
    const a = mk('a', 23, 56);
    const map = new Map([['a', a]]);
    snapToGrid(map);
    expect(map.get('a')).toBe(a);
  });
});

describe('absolutizeAll', () => {
  it('top-level node: relPos becomes absolute (parent at 0,0)', () => {
    const a = mk('a');
    const nodeMap = new Map([['a', a]]);
    const relPos = new Map([['a', { x: 50, y: 60 }]]);
    absolutizeAll(['a'], nodeMap, new Map(), relPos, new Map());
    expect(a.x).toBe(50);
    expect(a.y).toBe(60);
  });

  it('child position is parent.abs + child.rel', () => {
    const p = mk('p');
    const c = mk('c');
    const nodeMap = new Map([
      ['p', p],
      ['c', c],
    ]);
    const childrenOf = new Map([['p', ['c']]]);
    const relPos = new Map([
      ['p', { x: 100, y: 200 }],
      ['c', { x: 10, y: 20 }],
    ]);
    absolutizeAll(['p'], nodeMap, childrenOf, relPos, new Map());
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(c.x).toBe(110);
    expect(c.y).toBe(220);
  });

  it('grandchild accumulates two levels of offset', () => {
    const p = mk('p');
    const c = mk('c');
    const g = mk('g');
    const nodeMap = new Map([
      ['p', p],
      ['c', c],
      ['g', g],
    ]);
    const childrenOf = new Map([
      ['p', ['c']],
      ['c', ['g']],
    ]);
    const relPos = new Map([
      ['p', { x: 100, y: 200 }],
      ['c', { x: 10, y: 20 }],
      ['g', { x: 5, y: 5 }],
    ]);
    absolutizeAll(['p'], nodeMap, childrenOf, relPos, new Map());
    expect(g.x).toBe(115);
    expect(g.y).toBe(225);
  });

  it('container size from containerSize overwrites stored width/height', () => {
    const p = mk('p', 0, 0, 200, 100);
    const nodeMap = new Map([['p', p]]);
    const containerSize = new Map([['p', { width: 600, height: 400 }]]);
    absolutizeAll(['p'], nodeMap, new Map(), new Map(), containerSize);
    expect(p.width).toBe(600);
    expect(p.height).toBe(400);
  });

  it('node missing from nodeMap is skipped (no error)', () => {
    const a = mk('a');
    const nodeMap = new Map([['a', a]]);
    const childrenOf = new Map([['a', ['ghost']]]);
    expect(() => absolutizeAll(['a'], nodeMap, childrenOf, new Map(), new Map())).not.toThrow();
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
  });

  it('node without a relPos entry keeps its current x/y', () => {
    const a = mk('a', 999, 888);
    const nodeMap = new Map([['a', a]]);
    absolutizeAll(['a'], nodeMap, new Map(), new Map(), new Map());
    // No relPos for 'a' — its x/y stay at the seeded values.
    expect(a.x).toBe(999);
    expect(a.y).toBe(888);
  });

  it('two siblings: each is positioned independently from the parent absolute', () => {
    const p = mk('p');
    const c1 = mk('c1');
    const c2 = mk('c2');
    const nodeMap = new Map([
      ['p', p],
      ['c1', c1],
      ['c2', c2],
    ]);
    const childrenOf = new Map([['p', ['c1', 'c2']]]);
    const relPos = new Map([
      ['p', { x: 100, y: 100 }],
      ['c1', { x: 10, y: 0 }],
      ['c2', { x: 0, y: 10 }],
    ]);
    absolutizeAll(['p'], nodeMap, childrenOf, relPos, new Map());
    expect(c1).toMatchObject({ x: 110, y: 100 });
    expect(c2).toMatchObject({ x: 100, y: 110 });
  });
});
