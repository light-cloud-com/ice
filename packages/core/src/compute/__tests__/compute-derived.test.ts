/**
 * Tests for `compute/compute-derived.ts`.
 *
 * Behaviour pinned:
 *  - computeDerived is pure: same inputs → same outputs, no side-effects.
 *  - empty graph → empty PatchSet.
 *  - Per-edge propagation walks both source→target and target→source rules
 *    on every edge, accumulating patches by node ID with merge-last-write-wins.
 *  - Aggregate rules sweep every node once.
 *  - Edges referencing missing source/target nodes are skipped.
 *  - backfillRouteIds assigns free route slots to CustomDomain edges that
 *    lack one.
 *  - detectOrphanEdges flags CustomDomain edges whose routeId is no longer
 *    in `data.routes`.
 *  - diffPatches strips patches whose values already match current state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeDerived, diffPatches } from '../compute-derived';
import type {
  AggregateRule,
  PropagationContext,
  PropagationEdge,
  PropagationNode,
  PropagationRule,
  PatchSet,
} from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeNode(id: string, iceType: string, extra: Record<string, unknown> = {}): PropagationNode {
  return { id, type: 'block', data: { iceType, ...extra } };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  data: PropagationEdge['data'] = {},
): PropagationEdge {
  return { id, source, target, data };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Empty graph ───────────────────────────────────────────────────────────

describe('computeDerived: empty graph', () => {
  it('returns an empty patch set when there are no nodes or edges', () => {
    const out = computeDerived([], []);
    expect(out).toEqual({ nodePatches: [], edgePatches: [], edgeDeletions: [] });
  });

  it('returns an empty patch set when nodes have no edges and no aggregate rules apply', () => {
    const nodes = [makeNode('a', 'Network.CustomDomain', { domain: 'mysite.com' })];
    const out = computeDerived(nodes, []);
    expect(out.nodePatches).toEqual([]);
    expect(out.edgePatches).toEqual([]);
    expect(out.edgeDeletions).toEqual([]);
  });
});

// ─── Per-edge propagation: real rules ──────────────────────────────────────

describe('computeDerived: real rule propagation', () => {
  it('CustomDomain → Compute applies domain & custom_domain to the target', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: 'api' });
    const out = computeDerived([cd, svc], [edge]);
    const svcPatch = out.nodePatches.find((p) => p.nodeId === 's1');
    expect(svcPatch?.data).toMatchObject({
      domain: 'api.mysite.com',
      custom_domain: 'api.mysite.com',
    });
  });

  it('treats edge in either direction symmetrically (CustomDomain as target also propagates)', () => {
    // Some edges may be modeled with the service as source and CustomDomain as target.
    // The engine's symmetric pass tries both orderings of the rule.
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 's1', 'cd1', { subdomain: 'api' });
    const out = computeDerived([cd, svc], [edge]);
    const ids = out.nodePatches.map((p) => p.nodeId);
    expect(ids).toContain('s1');
  });

  it('Service → Secret rule (target→source direction) writes to the service, not the secret', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const sec = makeNode('sec1', 'Security.Secret', {
      secrets: [{ key: 'API_KEY', ref: 'prod-api-key' }],
    });
    const edge = makeEdge('e1', 's1', 'sec1');
    const out = computeDerived([svc, sec], [edge]);
    const svcPatch = out.nodePatches.find((p) => p.nodeId === 's1');
    const secPatch = out.nodePatches.find((p) => p.nodeId === 'sec1');
    expect(svcPatch?.data).toMatchObject({
      secretRefs: [{ envVar: 'API_KEY', secretName: 'prod-api-key' }],
    });
    // Secret receives no secretRefs patch (might be undefined entirely, or
    // present from an unrelated aggregate rule but without secretRefs key).
    if (secPatch) {
      expect(secPatch.data).not.toHaveProperty('secretRefs');
    }
  });

  it('Backend → DataStore propagation stamps port & envVarName on the data store', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const db = makeNode('db1', 'Database.PostgreSQL');
    const edge = makeEdge('e1', 's1', 'db1', { connectionCategory: 'traffic' });
    const out = computeDerived([svc, db], [edge]);
    const dbPatch = out.nodePatches.find((p) => p.nodeId === 'db1');
    expect(dbPatch?.data).toMatchObject({ port: 5432, envVarName: 'DATABASE_URL' });
  });

  it('skips per-edge propagation rules when source node is missing from the index', () => {
    // Pass empty rules + aggregates so we can isolate the "skip" path.
    const tgt = makeNode('t1', 'Compute.Container');
    const edge = makeEdge('e1', 'missing', 't1');
    const out = computeDerived([tgt], [edge], [], []);
    expect(out.nodePatches).toEqual([]);
    expect(out.edgePatches).toEqual([]);
  });

  it('skips per-edge propagation rules when target node is missing from the index', () => {
    const src = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 's1', 'missing');
    const out = computeDerived([src], [edge], [], []);
    expect(out.nodePatches).toEqual([]);
  });
});

// ─── Per-edge propagation: synthetic custom rules ──────────────────────────

describe('computeDerived: synthetic propagation rules', () => {
  it('source→target rule writes patch onto target node ID', () => {
    const rule: PropagationRule = {
      label: 'A → B',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ marker: 'hit' }),
    };
    const a = makeNode('a', 'A');
    const b = makeNode('b', 'B');
    const out = computeDerived([a, b], [makeEdge('e1', 'a', 'b')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'b', data: { marker: 'hit' } }]);
  });

  it('target→source rule writes patch onto source node ID', () => {
    const rule: PropagationRule = {
      label: 'A ← B',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'target→source',
      compute: () => ({ marker: 'reverse' }),
    };
    const a = makeNode('a', 'A');
    const b = makeNode('b', 'B');
    const out = computeDerived([a, b], [makeEdge('e1', 'a', 'b')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'a', data: { marker: 'reverse' } }]);
  });

  it('rule firing on swapped (target,source) ordering uses receiver = original edge source', () => {
    // Rule says A→B but the edge is laid out B→A. The engine's else-branch
    // tries the swap so the rule still fires; for source→target the receiver
    // is the original edge.source ID (the B end), since after the swap the
    // node-position-of-source corresponds to the rule's source slot.
    const rule: PropagationRule = {
      label: 'A → B (swap-pass)',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ swapped: true }),
    };
    const a = makeNode('a', 'A');
    const b = makeNode('b', 'B');
    // Edge laid out B→A so the swap branch fires; receiverId = srcNode.id = 'b'
    const out = computeDerived([a, b], [makeEdge('e1', 'b', 'a')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'b', data: { swapped: true } }]);
  });

  it('swapped target→source rule writes to the original edge target', () => {
    const rule: PropagationRule = {
      label: 'A ← B (swap-pass)',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'target→source',
      compute: () => ({ marker: 'swap-rev' }),
    };
    const a = makeNode('a', 'A');
    const b = makeNode('b', 'B');
    // Edge laid out B→A so the swap branch fires; for target→source
    // receiverId = tgtNode.id = 'a'
    const out = computeDerived([a, b], [makeEdge('e1', 'b', 'a')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'a', data: { marker: 'swap-rev' } }]);
  });

  it('multiple rules merge into one node patch (last write wins per key)', () => {
    const r1: PropagationRule = {
      label: 'r1',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ shared: 'first', uniqueA: 1 }),
    };
    const r2: PropagationRule = {
      label: 'r2',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ shared: 'second', uniqueB: 2 }),
    };
    const out = computeDerived(
      [makeNode('a', 'A'), makeNode('b', 'B')],
      [makeEdge('e1', 'a', 'b')],
      [r1, r2],
      [],
    );
    expect(out.nodePatches).toEqual([
      { nodeId: 'b', data: { shared: 'second', uniqueA: 1, uniqueB: 2 } },
    ]);
  });

  it('rule.compute returning null contributes no patch', () => {
    const rule: PropagationRule = {
      label: 'noop',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => null,
    };
    const out = computeDerived(
      [makeNode('a', 'A'), makeNode('b', 'B')],
      [makeEdge('e1', 'a', 'b')],
      [rule],
      [],
    );
    expect(out.nodePatches).toEqual([]);
  });

  it('null patch from swap branch is also a no-op', () => {
    const rule: PropagationRule = {
      label: 'noop-swap',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => null,
    };
    // Edge laid out B→A so the swap branch fires
    const out = computeDerived(
      [makeNode('a', 'A'), makeNode('b', 'B')],
      [makeEdge('e1', 'b', 'a')],
      [rule],
      [],
    );
    expect(out.nodePatches).toEqual([]);
  });

  it('multi-hop A→B and B→C: each hop receives its own patch', () => {
    const ab: PropagationRule = {
      label: 'A→B',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ fromA: true }),
    };
    const bc: PropagationRule = {
      label: 'B→C',
      source: (t) => t === 'B',
      target: (t) => t === 'C',
      direction: 'source→target',
      compute: () => ({ fromB: true }),
    };
    const out = computeDerived(
      [makeNode('a', 'A'), makeNode('b', 'B'), makeNode('c', 'C')],
      [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')],
      [ab, bc],
      [],
    );
    const byId = new Map(out.nodePatches.map((p) => [p.nodeId, p.data]));
    expect(byId.get('b')).toEqual({ fromA: true });
    expect(byId.get('c')).toEqual({ fromB: true });
  });

  it('cycle A→B→A terminates without infinite loop and applies rules per-edge', () => {
    const ab: PropagationRule = {
      label: 'A→B',
      source: (t) => t === 'A',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ ab: true }),
    };
    const ba: PropagationRule = {
      label: 'B→A',
      source: (t) => t === 'B',
      target: (t) => t === 'A',
      direction: 'source→target',
      compute: () => ({ ba: true }),
    };
    const out = computeDerived(
      [makeNode('a', 'A'), makeNode('b', 'B')],
      [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')],
      [ab, ba],
      [],
    );
    const byId = new Map(out.nodePatches.map((p) => [p.nodeId, p.data]));
    expect(byId.get('a')).toEqual({ ba: true });
    expect(byId.get('b')).toEqual({ ab: true });
  });

  it('node with empty data.iceType (or missing) does not match string-type rules', () => {
    const a = makeNode('a', '', {});
    delete (a.data as { iceType?: unknown }).iceType;
    const b = makeNode('b', 'B');
    const rule: PropagationRule = {
      label: 'r',
      source: (t) => t === '',
      target: (t) => t === 'B',
      direction: 'source→target',
      compute: () => ({ ok: true }),
    };
    const out = computeDerived([a, b], [makeEdge('e1', 'a', 'b')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'b', data: { ok: true } }]);
  });

  it('node with missing iceType on TARGET also degrades to empty-string type', () => {
    const a = makeNode('a', 'A');
    const b: PropagationNode = { id: 'b', type: 'block', data: {} };
    const rule: PropagationRule = {
      label: 'r',
      source: (t) => t === 'A',
      target: (t) => t === '',
      direction: 'source→target',
      compute: () => ({ ok: true }),
    };
    const out = computeDerived([a, b], [makeEdge('e1', 'a', 'b')], [rule], []);
    expect(out.nodePatches).toEqual([{ nodeId: 'b', data: { ok: true } }]);
  });

  it('aggregate rule sees empty-string nodeType when iceType is missing', () => {
    const node: PropagationNode = { id: 'n', type: 'block', data: {} };
    const captured: string[] = [];
    const aggRule: AggregateRule = {
      label: 'capture-type',
      appliesTo: (t) => {
        captured.push(t);
        return false;
      },
      compute: () => null,
    };
    computeDerived([node], [], [], [aggRule]);
    expect(captured).toEqual(['']);
  });
});

// ─── Aggregate rules ───────────────────────────────────────────────────────

describe('computeDerived: aggregate rules', () => {
  it('runs aggregate rule once per matching node and merges with edge-based patches', () => {
    const aggRule: AggregateRule = {
      label: 'tag',
      appliesTo: (t) => t === 'A',
      compute: () => ({ aggregated: true }),
    };
    const propRule: PropagationRule = {
      label: 'A→A',
      source: (t) => t === 'A',
      target: (t) => t === 'A',
      direction: 'source→target',
      compute: () => ({ propagated: true }),
    };
    const out = computeDerived(
      [makeNode('a1', 'A'), makeNode('a2', 'A')],
      [makeEdge('e1', 'a1', 'a2')],
      [propRule],
      [aggRule],
    );
    const byId = new Map(out.nodePatches.map((p) => [p.nodeId, p.data]));
    expect(byId.get('a1')).toMatchObject({ aggregated: true });
    expect(byId.get('a2')).toMatchObject({ aggregated: true, propagated: true });
  });

  it('aggregate rule sees inbound and outbound edges per node', () => {
    const captured: Array<{
      nodeId: string;
      inboundCount: number;
      outboundCount: number;
    }> = [];
    const aggRule: AggregateRule = {
      label: 'capture',
      appliesTo: (t) => t === 'X',
      compute: (node, inbound, outbound) => {
        captured.push({
          nodeId: node.id,
          inboundCount: inbound.length,
          outboundCount: outbound.length,
        });
        return null;
      },
    };
    const out = computeDerived(
      [makeNode('x1', 'X'), makeNode('x2', 'X'), makeNode('x3', 'X')],
      [makeEdge('e1', 'x1', 'x2'), makeEdge('e2', 'x2', 'x3'), makeEdge('e3', 'x1', 'x2')],
      [],
      [aggRule],
    );
    expect(out.nodePatches).toEqual([]);
    const byId = new Map(captured.map((c) => [c.nodeId, c]));
    expect(byId.get('x1')).toEqual({ nodeId: 'x1', inboundCount: 0, outboundCount: 2 });
    expect(byId.get('x2')).toEqual({ nodeId: 'x2', inboundCount: 2, outboundCount: 1 });
    expect(byId.get('x3')).toEqual({ nodeId: 'x3', inboundCount: 1, outboundCount: 0 });
  });

  it('aggregate rule that does not apply is skipped silently', () => {
    const aggRule: AggregateRule = {
      label: 'never',
      appliesTo: () => false,
      compute: () => ({ shouldNotAppear: true }),
    };
    const out = computeDerived([makeNode('a', 'A')], [], [], [aggRule]);
    expect(out.nodePatches).toEqual([]);
  });

  it('aggregate compute returning null is dropped', () => {
    const aggRule: AggregateRule = {
      label: 'null-result',
      appliesTo: (t) => t === 'A',
      compute: () => null,
    };
    const out = computeDerived([makeNode('a', 'A')], [], [], [aggRule]);
    expect(out.nodePatches).toEqual([]);
  });

  it('passes a context with the original allNodes and allEdges arrays', () => {
    let captured: PropagationContext | null = null;
    const aggRule: AggregateRule = {
      label: 'ctx',
      appliesTo: () => true,
      compute: (_n, _i, _o, ctx) => {
        captured = ctx;
        return null;
      },
    };
    const nodes = [makeNode('a', 'A')];
    const edges = [makeEdge('e1', 'a', 'a')];
    computeDerived(nodes, edges, [], [aggRule]);
    expect(captured).not.toBeNull();
    expect(captured!.allNodes).toBe(nodes);
    expect(captured!.allEdges).toBe(edges);
  });
});

// ─── Edge maintenance: routeId backfill ────────────────────────────────────

describe('computeDerived: backfillRouteIds', () => {
  it('does nothing when the CustomDomain has no routes', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgePatches).toEqual([]);
  });

  it('assigns the first free route id to an unrouted edge', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [
        { id: 'r1', subdomain: 'app' },
        { id: 'r2', subdomain: 'api' },
      ],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgePatches).toEqual([{ edgeId: 'e1', data: { routeId: 'r1' } }]);
  });

  it('preserves an edge whose routeId already matches a route', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }, { id: 'r2', subdomain: 'api' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r2' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgePatches).toEqual([]);
  });

  it('backfills with the first FREE route, skipping ones already claimed by other edges', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }, { id: 'r2', subdomain: 'api' }],
    });
    const svc1 = makeNode('s1', 'Compute.Container');
    const svc2 = makeNode('s2', 'Compute.Container');
    const claimed = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    const blank = makeEdge('e2', 'cd1', 's2');
    const out = computeDerived([cd, svc1, svc2], [claimed, blank]);
    expect(out.edgePatches).toEqual([{ edgeId: 'e2', data: { routeId: 'r2' } }]);
  });

  it('stops backfilling when there are no free routes left', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc1 = makeNode('s1', 'Compute.Container');
    const svc2 = makeNode('s2', 'Compute.Container');
    const claimed = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    const orphan = makeEdge('e2', 'cd1', 's2');
    const out = computeDerived([cd, svc1, svc2], [claimed, orphan]);
    expect(out.edgePatches).toEqual([]);
  });

  it('treats an edge with a routeId that no longer matches as needing backfill', () => {
    // routeId references a route that doesn't exist; it's not claimed and
    // gets reassigned to the first free route.
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'orphan' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgePatches).toEqual([{ edgeId: 'e1', data: { routeId: 'r1' } }]);
  });

  it('also backfills edges where CustomDomain is the target', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 's1', 'cd1');
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgePatches).toEqual([{ edgeId: 'e1', data: { routeId: 'r1' } }]);
  });
});

// ─── Edge maintenance: orphan detection ────────────────────────────────────

describe('computeDerived: detectOrphanEdges', () => {
  it('flags a CustomDomain edge whose routeId is no longer in routes[]', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'orphan' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgeDeletions).toEqual([{ edgeId: 'e1' }]);
  });

  it('does not flag an edge with no routeId at all', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('does not flag when CustomDomain has empty routes (no positive evidence)', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com', routes: [] });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('does not flag when CustomDomain.routes is undefined (treated as no positive evidence)', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('handles a CustomDomain edge whose source/target nodes are missing iceType field', () => {
    // detectOrphanEdges reads `data?.iceType` — verify the `|| ''` fallback path
    // is exercised when both ends lack iceType.
    const blank: PropagationNode = { id: 'a', type: 'block', data: {} };
    const blank2: PropagationNode = { id: 'b', type: 'block', data: {} };
    const edge = makeEdge('e1', 'a', 'b', { routeId: 'orphan' });
    const out = computeDerived([blank, blank2], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('does not flag a non-CustomDomain edge regardless of routeId', () => {
    const a = makeNode('a', 'Compute.Container');
    const b = makeNode('b', 'Database.PostgreSQL');
    const edge = makeEdge('e1', 'a', 'b', { routeId: 'r-anything' });
    const out = computeDerived([a, b], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('skips an edge whose source or target node is missing during orphan detection', () => {
    // The edge references a missing source — orphan detection short-circuits.
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const edge = makeEdge('e1', 'missing-src', 'cd1', { routeId: 'orphan' });
    const out = computeDerived([cd], [edge]);
    expect(out.edgeDeletions).toEqual([]);
  });

  it('flags via the target side when CustomDomain is the target', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 's1', 'cd1', { routeId: 'orphan' });
    const out = computeDerived([cd, svc], [edge]);
    expect(out.edgeDeletions).toEqual([{ edgeId: 'e1' }]);
  });
});

// ─── Pure / idempotent ─────────────────────────────────────────────────────

describe('computeDerived: pure & idempotent', () => {
  it('produces equivalent output for identical inputs across two calls', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: 'api' });
    const a = computeDerived([cd, svc], [edge]);
    const b = computeDerived([cd, svc], [edge]);
    expect(a).toEqual(b);
  });

  it('does not mutate inputs', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: 'api' });
    const cdSnap = JSON.stringify(cd);
    const svcSnap = JSON.stringify(svc);
    const edgeSnap = JSON.stringify(edge);
    computeDerived([cd, svc], [edge]);
    expect(JSON.stringify(cd)).toBe(cdSnap);
    expect(JSON.stringify(svc)).toBe(svcSnap);
    expect(JSON.stringify(edge)).toBe(edgeSnap);
  });
});

// ─── diffPatches ───────────────────────────────────────────────────────────

describe('diffPatches', () => {
  function patchSet(over: Partial<PatchSet> = {}): PatchSet {
    return {
      nodePatches: [],
      edgePatches: [],
      edgeDeletions: [],
      ...over,
    };
  }

  it('keeps a node patch when at least one key differs', () => {
    const node = makeNode('a', 'A', { x: 1, y: 'old' });
    const out = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'a', data: { x: 1, y: 'new' } }] }),
      [node],
      [],
    );
    expect(out.nodePatches).toEqual([{ nodeId: 'a', data: { x: 1, y: 'new' } }]);
  });

  it('drops a node patch when every key already matches', () => {
    const node = makeNode('a', 'A', { x: 1, y: 'same' });
    const out = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'a', data: { x: 1, y: 'same' } }] }),
      [node],
      [],
    );
    expect(out.nodePatches).toEqual([]);
  });

  it('drops a node patch whose target node is no longer present', () => {
    const out = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'gone', data: { x: 1 } }] }),
      [],
      [],
    );
    expect(out.nodePatches).toEqual([]);
  });

  it('keeps an edge patch when at least one key differs from current edge data', () => {
    const edge = makeEdge('e1', 'a', 'b', { routeId: 'old' });
    const out = diffPatches(
      patchSet({ edgePatches: [{ edgeId: 'e1', data: { routeId: 'new' } }] }),
      [],
      [edge],
    );
    expect(out.edgePatches).toEqual([{ edgeId: 'e1', data: { routeId: 'new' } }]);
  });

  it('drops an edge patch when current data already matches', () => {
    const edge = makeEdge('e1', 'a', 'b', { routeId: 'r1' });
    const out = diffPatches(
      patchSet({ edgePatches: [{ edgeId: 'e1', data: { routeId: 'r1' } }] }),
      [],
      [edge],
    );
    expect(out.edgePatches).toEqual([]);
  });

  it('drops an edge patch whose target edge is no longer present', () => {
    const out = diffPatches(
      patchSet({ edgePatches: [{ edgeId: 'gone', data: { routeId: 'r1' } }] }),
      [],
      [],
    );
    expect(out.edgePatches).toEqual([]);
  });

  it('treats an edge with no data field as having undefined values', () => {
    const edge: PropagationEdge = { id: 'e1', source: 'a', target: 'b' };
    const out = diffPatches(
      patchSet({ edgePatches: [{ edgeId: 'e1', data: { routeId: 'r1' } }] }),
      [],
      [edge],
    );
    expect(out.edgePatches).toEqual([{ edgeId: 'e1', data: { routeId: 'r1' } }]);
  });

  it('forwards edgeDeletions verbatim', () => {
    const out = diffPatches(
      patchSet({ edgeDeletions: [{ edgeId: 'e1' }] }),
      [],
      [],
    );
    expect(out.edgeDeletions).toEqual([{ edgeId: 'e1' }]);
  });

  it('uses deep equality for object values via JSON.stringify', () => {
    const node = makeNode('a', 'A', {
      list: [1, 2, 3],
      obj: { nested: 'same' },
    });
    const out = diffPatches(
      patchSet({
        nodePatches: [
          { nodeId: 'a', data: { list: [1, 2, 3], obj: { nested: 'same' } } },
        ],
      }),
      [node],
      [],
    );
    expect(out.nodePatches).toEqual([]);
  });

  it('detects deep inequality on object values', () => {
    const node = makeNode('a', 'A', {
      list: [1, 2, 3],
    });
    const out = diffPatches(
      patchSet({
        nodePatches: [{ nodeId: 'a', data: { list: [1, 2, 4] } }],
      }),
      [node],
      [],
    );
    expect(out.nodePatches).toEqual([{ nodeId: 'a', data: { list: [1, 2, 4] } }]);
  });

  it('treats null === null as equal but null !== 0', () => {
    const node = makeNode('a', 'A', { x: null });
    const sameOut = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'a', data: { x: null } }] }),
      [node],
      [],
    );
    expect(sameOut.nodePatches).toEqual([]);
    const diffOut = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'a', data: { x: 0 } }] }),
      [node],
      [],
    );
    expect(diffOut.nodePatches).toEqual([{ nodeId: 'a', data: { x: 0 } }]);
  });

  it('detects type mismatch (string vs number) as not-equal', () => {
    const node = makeNode('a', 'A', { x: '5' });
    const out = diffPatches(
      patchSet({ nodePatches: [{ nodeId: 'a', data: { x: 5 } }] }),
      [node],
      [],
    );
    expect(out.nodePatches).toEqual([{ nodeId: 'a', data: { x: 5 } }]);
  });
});

// ─── Default rule arrays ───────────────────────────────────────────────────

describe('computeDerived: default rules', () => {
  it('uses PROPAGATION_RULES and AGGREGATE_RULES when no rules arrays are passed', () => {
    const cd = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const svc = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: 'api' });
    // Don't pass `rules` or `aggregateRules`; defaults must apply.
    const out = computeDerived([cd, svc], [edge]);
    const svcPatch = out.nodePatches.find((p) => p.nodeId === 's1');
    // From the real CustomDomain rule
    expect(svcPatch?.data).toMatchObject({ domain: 'api.mysite.com' });
  });
});

// ─── Barrel re-exports ─────────────────────────────────────────────────────

describe('compute/index barrel', () => {
  it('re-exports computeDerived, diffPatches, and the rule arrays', async () => {
    const barrel = await import('../index');
    expect(typeof barrel.computeDerived).toBe('function');
    expect(typeof barrel.diffPatches).toBe('function');
    expect(Array.isArray(barrel.PROPAGATION_RULES)).toBe(true);
    expect(Array.isArray(barrel.AGGREGATE_RULES)).toBe(true);
  });
});
