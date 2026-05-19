/**
 * rf-aiop-2 — generateNodeId / generateEdgeId / resolveId / nodeExists.
 *
 * The generators are timestamp+counter-based and the counter is module-
 * private. Tests assert the SHAPE of the IDs (prefix + numeric segments)
 * and uniqueness across consecutive calls — the actual counter value is
 * an implementation detail that other tests in the suite may have
 * advanced. The lookup helpers are pure over plain Card data and run
 * without any store wiring.
 */

import { describe, it, expect } from 'vitest';
import { generateNodeId, generateEdgeId, resolveId, nodeExists } from '../id-utils';
import type { Card, CardNode } from '../../../../../store/slices/cards-slice';

function makeCard(nodes: CardNode[]): Card {
  return {
    id: 'card-1',
    name: 'Test',
    nodes,
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  };
}

function makeNode(id: string): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 220,
    height: 72,
    data: {},
  };
}

describe('rf-aiop-2 generateNodeId', () => {
  it('returns a string of shape `node-<timestamp>-<counter>`', () => {
    const id = generateNodeId();
    expect(id).toMatch(/^node-\d+-\d+$/);
  });

  it('produces strictly distinct IDs across consecutive calls', () => {
    const a = generateNodeId();
    const b = generateNodeId();
    const c = generateNodeId();
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('counter advances even when many calls land in the same millisecond', () => {
    const ids = Array.from({ length: 5 }, () => generateNodeId());
    expect(new Set(ids).size).toBe(5);
  });
});

describe('rf-aiop-2 generateEdgeId', () => {
  it('returns a string of shape `edge-<timestamp>-<counter>`', () => {
    const id = generateEdgeId();
    expect(id).toMatch(/^edge-\d+-\d+$/);
  });

  it('produces strictly distinct IDs across consecutive calls', () => {
    const a = generateEdgeId();
    const b = generateEdgeId();
    expect(a).not.toBe(b);
  });

  it('shares the same counter as generateNodeId — node + edge IDs never collide on the numeric tail', () => {
    const node = generateNodeId();
    const edge = generateEdgeId();
    // Different prefixes, but the numeric tails differ too because the
    // counter advanced between calls.
    const nodeTail = node.split('-').slice(1).join('-');
    const edgeTail = edge.split('-').slice(1).join('-');
    expect(nodeTail).not.toBe(edgeTail);
  });
});

describe('rf-aiop-2 resolveId', () => {
  it('returns the mapped value when the id is in the map', () => {
    const idMap = new Map([['placeholder', 'real-node-1']]);
    expect(resolveId('placeholder', idMap)).toBe('real-node-1');
  });

  it('returns the original id when the map has no entry', () => {
    const idMap = new Map<string, string>();
    expect(resolveId('unmapped', idMap)).toBe('unmapped');
  });

  it('returns the original id when the map entry is empty string (falsy fallback)', () => {
    // The implementation uses `idMap.get(id) || id`, so an empty-string
    // mapped value falls back to the original — keep this behavior pinned.
    const idMap = new Map([['placeholder', '']]);
    expect(resolveId('placeholder', idMap)).toBe('placeholder');
  });
});

describe('rf-aiop-2 nodeExists', () => {
  it('returns true when the resolved id is in the card', () => {
    const card = makeCard([makeNode('real-1')]);
    const idMap = new Map([['ai-placeholder', 'real-1']]);
    expect(nodeExists('ai-placeholder', card, idMap)).toBe(true);
  });

  it('returns true when the original id (unmapped) is in the card', () => {
    const card = makeCard([makeNode('node-7')]);
    expect(nodeExists('node-7', card, new Map())).toBe(true);
  });

  it('returns false when the resolved id is not in the card', () => {
    const card = makeCard([makeNode('node-7')]);
    const idMap = new Map([['placeholder', 'missing']]);
    expect(nodeExists('placeholder', card, idMap)).toBe(false);
  });

  it('returns false on an empty card', () => {
    const card = makeCard([]);
    expect(nodeExists('anything', card, new Map())).toBe(false);
  });
});
