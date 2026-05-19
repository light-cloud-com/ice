/**
 * Tests for `cards/types.ts` — public type shapes + `DEFAULT_VIEWPORT`
 * (the only runtime export). Most tests are structural and prove the
 * type contract holds at the type-system level via constructor-style
 * assertions.
 *
 * @see rf-cards-1
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VIEWPORT,
  type Card,
  type CardEdge,
  type CardHistory,
  type CardNode,
  type CardSnapshot,
  type CardViewport,
  type CardsState,
} from '../types';

describe('DEFAULT_VIEWPORT', () => {
  it('is the identity viewport: pan=(0,0), scale=1', () => {
    expect(DEFAULT_VIEWPORT).toEqual({ panX: 0, panY: 0, scale: 1 });
  });

  it('exposes exactly the three viewport keys', () => {
    expect(Object.keys(DEFAULT_VIEWPORT).sort()).toEqual(['panX', 'panY', 'scale']);
  });

  it('is structurally a CardViewport', () => {
    // Compile-time: assigning to the typed local enforces the type contract.
    const vp: CardViewport = DEFAULT_VIEWPORT;
    expect(vp.panX).toBe(0);
    expect(vp.panY).toBe(0);
    expect(vp.scale).toBe(1);
  });

  it('can be spread onto a fresh viewport literal', () => {
    // Mirrors the cards-slice usage: `viewport: { ...DEFAULT_VIEWPORT }`.
    const fresh: CardViewport = { ...DEFAULT_VIEWPORT };
    expect(fresh).toEqual(DEFAULT_VIEWPORT);
    expect(fresh).not.toBe(DEFAULT_VIEWPORT);
  });
});

describe('CardNode', () => {
  it('accepts a minimal block node', () => {
    const node: CardNode = {
      id: 'n1',
      type: 'block',
      position: { x: 10, y: 20 },
      width: 200,
      height: 100,
      data: {},
    };
    expect(node.id).toBe('n1');
    expect(node.type).toBe('block');
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.width).toBe(200);
    expect(node.height).toBe(100);
    expect(node.parentId).toBeUndefined();
    expect(node.data).toEqual({});
  });

  it('accepts the resource and container variants of `type`', () => {
    const resource: CardNode = {
      id: 'r1',
      type: 'resource',
      position: { x: 0, y: 0 },
      width: 100,
      height: 60,
      data: { iceType: 'Compute.Function' },
    };
    const container: CardNode = {
      id: 'c1',
      type: 'container',
      position: { x: 0, y: 0 },
      width: 400,
      height: 300,
      data: {},
    };
    expect(resource.type).toBe('resource');
    expect(container.type).toBe('container');
  });

  it('threads the optional parentId through', () => {
    const child: CardNode = {
      id: 'child',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      parentId: 'parent-1',
      data: {},
    };
    expect(child.parentId).toBe('parent-1');
  });

  it('admits arbitrary keys on `data`', () => {
    const node: CardNode = {
      id: 'n2',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: { foo: 1, bar: 'two', nested: { ok: true } },
    };
    expect(node.data.foo).toBe(1);
    expect(node.data.bar).toBe('two');
  });
});

describe('CardEdge', () => {
  it('accepts a minimal edge with no data', () => {
    const edge: CardEdge = { id: 'e1', source: 'a', target: 'b' };
    expect(edge.id).toBe('e1');
    expect(edge.source).toBe('a');
    expect(edge.target).toBe('b');
    expect(edge.data).toBeUndefined();
  });

  it('threads the optional `data.relationship` through', () => {
    const edge: CardEdge = {
      id: 'e2',
      source: 'a',
      target: 'b',
      data: { relationship: 'depends-on' },
    };
    expect(edge.data?.relationship).toBe('depends-on');
  });

  it('admits arbitrary keys on `data` alongside relationship', () => {
    const edge: CardEdge = {
      id: 'e3',
      source: 'a',
      target: 'b',
      data: { relationship: 'connects', portIn: 'http', portOut: 'tls' },
    };
    expect(edge.data?.portIn).toBe('http');
    expect(edge.data?.portOut).toBe('tls');
  });
});

describe('CardViewport', () => {
  it('accepts a custom viewport', () => {
    const vp: CardViewport = { panX: 100, panY: -50, scale: 1.5 };
    expect(vp.panX).toBe(100);
    expect(vp.panY).toBe(-50);
    expect(vp.scale).toBe(1.5);
  });
});

describe('Card', () => {
  it('accepts a fully-populated card', () => {
    const card: Card = {
      id: 'card-1',
      name: 'My Card',
      nodes: [],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
      createdAt: 1700000000000,
      projectId: 'proj-1',
      environmentId: 'env-1',
    };
    expect(card.id).toBe('card-1');
    expect(card.name).toBe('My Card');
    expect(card.nodes).toEqual([]);
    expect(card.edges).toEqual([]);
    expect(card.viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    expect(card.createdAt).toBe(1700000000000);
    expect(card.projectId).toBe('proj-1');
    expect(card.environmentId).toBe('env-1');
  });

  it('accepts a card without optional project/environment ids', () => {
    const card: Card = {
      id: 'card-2',
      name: 'No Project',
      nodes: [],
      edges: [],
      viewport: { ...DEFAULT_VIEWPORT },
      createdAt: 0,
    };
    expect(card.projectId).toBeUndefined();
    expect(card.environmentId).toBeUndefined();
  });

  it('threads nodes and edges through', () => {
    const node: CardNode = {
      id: 'n1',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
    };
    const edge: CardEdge = { id: 'e1', source: 'n1', target: 'n2' };
    const card: Card = {
      id: 'card-3',
      name: 'Has Children',
      nodes: [node],
      edges: [edge],
      viewport: DEFAULT_VIEWPORT,
      createdAt: 0,
    };
    expect(card.nodes).toHaveLength(1);
    expect(card.edges).toHaveLength(1);
    expect(card.nodes[0].id).toBe('n1');
    expect(card.edges[0].source).toBe('n1');
  });
});

describe('CardSnapshot (internal)', () => {
  it('accepts an empty snapshot', () => {
    const snap: CardSnapshot = { nodes: [], edges: [] };
    expect(snap.nodes).toEqual([]);
    expect(snap.edges).toEqual([]);
  });

  it('accepts a populated snapshot', () => {
    const node: CardNode = {
      id: 'n1',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 50,
      data: {},
    };
    const edge: CardEdge = { id: 'e1', source: 'n1', target: 'n2' };
    const snap: CardSnapshot = { nodes: [node], edges: [edge] };
    expect(snap.nodes).toHaveLength(1);
    expect(snap.edges).toHaveLength(1);
  });
});

describe('CardHistory (internal)', () => {
  it('accepts an empty history', () => {
    const history: CardHistory = { past: [], future: [] };
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
  });

  it('accepts past and future stacks', () => {
    const snap: CardSnapshot = { nodes: [], edges: [] };
    const history: CardHistory = { past: [snap, snap], future: [snap] };
    expect(history.past).toHaveLength(2);
    expect(history.future).toHaveLength(1);
  });
});

describe('CardsState', () => {
  it('accepts the empty initial shape', () => {
    const state: CardsState = { cards: [], activeCardId: null, history: {} };
    expect(state.cards).toEqual([]);
    expect(state.activeCardId).toBeNull();
    expect(state.history).toEqual({});
  });

  it('accepts a populated state', () => {
    const card: Card = {
      id: 'c1',
      name: 'A',
      nodes: [],
      edges: [],
      viewport: DEFAULT_VIEWPORT,
      createdAt: 0,
    };
    const state: CardsState = {
      cards: [card],
      activeCardId: 'c1',
      history: { c1: { past: [], future: [] } },
    };
    expect(state.cards).toHaveLength(1);
    expect(state.activeCardId).toBe('c1');
    expect(state.history.c1).toEqual({ past: [], future: [] });
  });
});
