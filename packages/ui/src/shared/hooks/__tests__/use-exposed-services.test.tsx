/**
 * useExposedServices — tests for the pure useMemo entry-point detection hook.
 *
 * The hook is fully pure (useMemo only) so no Provider/store is required.
 * We render through a Probe via `renderToString` to capture the return value.
 *
 * Branches under test:
 *   - candidate detection: ENTRY_TYPES, public-domain, NEVER_EXPOSED_TYPES
 *   - explicit data.exposed true/false short-circuits
 *   - private subnet exclusion (vs. public subnet inclusion)
 *   - traceToVisibleNodes BFS at Level 1 (hidden VPC chain)
 *   - filterToFrontend SaaS branch when Group.Frontend exists
 *   - centroid + topY computation including VPC nodes
 *   - empty result paths
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { CanvasNode } from '../../../features/canvas/components/types';
import { useExposedServices } from '../use-exposed-services';

interface EdgeLike {
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

function makeNode(partial: Partial<CanvasNode> & { id: string }): CanvasNode {
  return {
    id: partial.id,
    type: partial.type ?? 'block',
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? 100,
    height: partial.height ?? 60,
    label: partial.label ?? '',
    data: partial.data ?? {},
    parentId: partial.parentId ?? null,
  };
}

function captureHook(
  visibleNodes: CanvasNode[],
  edges: EdgeLike[],
  allNodes?: CanvasNode[],
): ReturnType<typeof useExposedServices> {
  const captured: { current?: ReturnType<typeof useExposedServices> } = {};
  const Probe: React.FC = () => {
    captured.current = useExposedServices(visibleNodes, edges, allNodes);
    return null;
  };
  renderToString(<Probe />);
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

describe('useExposedServices — empty result paths', () => {
  it('returns empty result when there are no nodes', () => {
    const out = captureHook([], []);
    expect(out.nodeIds).toEqual([]);
    expect(out.userIconPosition).toBeNull();
  });

  it('returns empty result when no nodes are entry candidates', () => {
    const out = captureHook(
      [makeNode({ id: 'n1', data: { iceType: 'Database.PostgreSQL' } })],
      [],
    );
    expect(out.nodeIds).toEqual([]);
    expect(out.userIconPosition).toBeNull();
  });
});

describe('useExposedServices — explicit exposed flag', () => {
  it('exposes a node with data.exposed === true even if iceType would normally exclude it', () => {
    const out = captureHook(
      [makeNode({ id: 'n1', x: 50, y: 100, width: 80, data: { iceType: 'Database.PostgreSQL', exposed: true } })],
      [],
    );
    expect(out.nodeIds).toEqual(['n1']);
    expect(out.userIconPosition).not.toBeNull();
    // centerX = 50 + 80/2 = 90; topY = node.y - 100 = 0
    expect(out.userIconPosition).toEqual({ x: 90, y: 0 });
  });

  it('excludes a node with data.exposed === false even if it would otherwise qualify', () => {
    const out = captureHook(
      [makeNode({ id: 'n1', data: { iceType: 'Network.LoadBalancer', exposed: false } })],
      [],
    );
    expect(out.nodeIds).toEqual([]);
  });
});

describe('useExposedServices — entry type detection', () => {
  it('exposes a Network.LoadBalancer with no incoming connects_to edges', () => {
    const out = captureHook(
      [makeNode({ id: 'lb', x: 0, y: 200, width: 100, data: { iceType: 'Network.LoadBalancer' } })],
      [],
    );
    expect(out.nodeIds).toEqual(['lb']);
  });

  it('does not expose a Network.LoadBalancer that has incoming connects_to edge', () => {
    const lb = makeNode({ id: 'lb', data: { iceType: 'Network.LoadBalancer' } });
    const waf = makeNode({ id: 'waf', data: { iceType: 'Security.WAF' } });
    const out = captureHook(
      [waf, lb],
      [{ source: 'waf', target: 'lb', data: { relationship: 'connects_to' } }],
    );
    expect(out.nodeIds).toEqual(['waf']);
  });

  it('exposes a node with a real public domain', () => {
    const out = captureHook(
      [makeNode({ id: 'app', data: { iceType: 'Compute.Container', domain: 'app.example.org' } })],
      [],
    );
    expect(out.nodeIds).toEqual(['app']);
  });

  it('does not expose a node whose only domain is internal', () => {
    const out = captureHook(
      [makeNode({ id: 'svc', data: { iceType: 'Compute.Worker', domain: 'redis.internal' } })],
      [],
    );
    // Compute.Worker is in NEVER_EXPOSED_TYPES so even with a domain it's excluded
    expect(out.nodeIds).toEqual([]);
  });

  it('treats placeholder example.com as internal (not exposed via domain alone)', () => {
    // Use Compute.Worker which is NEVER_EXPOSED_TYPES so it can't qualify on iceType alone.
    // Use a normal block type, see if a domain of example.com counts as internal.
    const out = captureHook(
      [makeNode({ id: 'app', data: { iceType: 'Custom.Block', domain: 'example.com' } })],
      [],
    );
    expect(out.nodeIds).toEqual([]);
  });

  it('rejects empty domain string and known internal hosts', () => {
    const out = captureHook(
      [
        makeNode({ id: 'a', data: { iceType: 'Custom.X', domain: '' } }),
        makeNode({ id: 'b', data: { iceType: 'Custom.X', domain: 'localhost' } }),
        makeNode({ id: 'c', data: { iceType: 'Custom.X', domain: 'svc.local' } }),
      ],
      [],
    );
    expect(out.nodeIds).toEqual([]);
  });

  it('falls back to subdomain or url fields for the domain check', () => {
    const out = captureHook(
      [makeNode({ id: 'a', x: 0, y: 0, width: 50, data: { iceType: 'Custom.X', subdomain: 'foo.example.org' } })],
      [],
    );
    expect(out.nodeIds).toEqual(['a']);
  });

  it('NEVER_EXPOSED_TYPES blocks even an entry-type-listed candidate from being a candidate', () => {
    // Database.Redis is in NEVER_EXPOSED — even with a domain set, it should not qualify
    const out = captureHook(
      [makeNode({ id: 'r', data: { iceType: 'Database.Redis', domain: 'real.example.org' } })],
      [],
    );
    expect(out.nodeIds).toEqual([]);
  });
});

describe('useExposedServices — private subnet exclusion', () => {
  it('excludes a candidate that lives inside a private subnet', () => {
    const subnet = makeNode({
      id: 'sub',
      type: 'container',
      data: { iceType: 'Network.Subnet', visibility: 'private' },
    });
    const lb = makeNode({
      id: 'lb',
      parentId: 'sub',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([subnet, lb], []);
    expect(out.nodeIds).toEqual([]);
  });

  it('does not exclude a candidate inside a public subnet', () => {
    const subnet = makeNode({
      id: 'sub',
      type: 'container',
      data: { iceType: 'Network.Subnet', visibility: 'public' },
    });
    const lb = makeNode({
      id: 'lb',
      x: 10,
      y: 50,
      width: 100,
      parentId: 'sub',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([subnet, lb], []);
    expect(out.nodeIds).toEqual(['lb']);
  });

  it('breaks when a missing parent is referenced (defensive)', () => {
    const lb = makeNode({
      id: 'lb',
      parentId: 'missing',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([lb], []);
    // No subnet ancestor → reaches isEntryCandidate, exposed
    expect(out.nodeIds).toEqual(['lb']);
  });
});

describe('useExposedServices — Level 1 trace through hidden entry points', () => {
  it('traces from hidden entry points to first visible nodes', () => {
    const lb = makeNode({ id: 'lb', x: 0, y: 100, width: 100, data: { iceType: 'Network.LoadBalancer' } });
    const cdn = makeNode({ id: 'cdn', x: 0, y: 100, width: 100, data: { iceType: 'Network.CDN' } });
    const visibleApp = makeNode({ id: 'app', x: 200, y: 200, width: 100, data: { iceType: 'Compute.Container' } });
    const allNodes = [lb, cdn, visibleApp];
    // Visible only contains app, no entry candidates among visibles
    const visibleNodes = [visibleApp];
    // Wire LB → CDN → app (connects_to)
    const edges: EdgeLike[] = [
      { source: 'lb', target: 'cdn', data: { relationship: 'connects_to' } },
      { source: 'cdn', target: 'app', data: { relationship: 'connects_to' } },
    ];
    const out = captureHook(visibleNodes, edges, allNodes);
    // CDN has incoming so only LB is a hidden entry. BFS from LB → cdn (hidden) → app (visible).
    expect(out.nodeIds).toEqual(['app']);
  });

  it('skips trace when allNodes.length equals visibleNodes.length', () => {
    const out = captureHook(
      [makeNode({ id: 'app', data: { iceType: 'Database.PostgreSQL' } })],
      [],
      [makeNode({ id: 'app', data: { iceType: 'Database.PostgreSQL' } })],
    );
    expect(out.nodeIds).toEqual([]);
  });

  it('skips containment edges in the BFS adjacency map', () => {
    // Hidden entry: lb. Visible: noEntryNode (Database, not entry, no domain).
    // 'contains' edge skipped in trace, 'connects_to' is followed.
    const lb = makeNode({ id: 'lb', x: 0, y: 100, width: 100, data: { iceType: 'Network.LoadBalancer' } });
    const visibleDb = makeNode({ id: 'db', x: 0, y: 100, width: 100, data: { iceType: 'Database.PostgreSQL' } });
    const allNodes = [lb, visibleDb];
    const visibleNodes = [visibleDb];
    // Only a 'contains' edge from lb→db: trace skips it → no traversal → empty
    const edges: EdgeLike[] = [{ source: 'lb', target: 'db', data: { relationship: 'contains' } }];
    const out = captureHook(visibleNodes, edges, allNodes);
    expect(out.nodeIds).toEqual([]);
  });
});

describe('useExposedServices — frontend filter', () => {
  it('filters to frontend nodes when Group.Frontend container exists', () => {
    const frontend = makeNode({
      id: 'fe',
      type: 'container',
      data: { iceType: 'Group.Frontend' },
    });
    const feApp = makeNode({
      id: 'feApp',
      x: 0,
      y: 100,
      width: 100,
      data: { iceType: 'Network.LoadBalancer' },
    });
    const beApp = makeNode({
      id: 'beApp',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const edges: EdgeLike[] = [
      { source: 'fe', target: 'feApp', data: { relationship: 'contains' } },
    ];
    const out = captureHook([frontend, feApp, beApp], edges);
    // beApp gets filtered out because frontend block exists; feApp survives
    expect(out.nodeIds).toEqual(['feApp']);
  });

  it('falls back to all exposed when frontend filter yields zero (non-SaaS)', () => {
    const frontend = makeNode({
      id: 'fe',
      type: 'container',
      data: { iceType: 'Group.Frontend' },
    });
    const beApp = makeNode({
      id: 'beApp',
      x: 0,
      y: 100,
      width: 100,
      data: { iceType: 'Network.LoadBalancer' },
    });
    // No 'contains' edges from frontend → frontend filter would yield empty → fallback
    const out = captureHook([frontend, beApp], []);
    expect(out.nodeIds).toEqual(['beApp']);
  });

  it('does not run frontend filter when no Group.Frontend exists', () => {
    const lb = makeNode({
      id: 'lb',
      x: 0,
      y: 100,
      width: 100,
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([lb], []);
    expect(out.nodeIds).toEqual(['lb']);
  });
});

describe('useExposedServices — userIconPosition geometry', () => {
  it('computes topY from VPC nodes when present', () => {
    const vpc = makeNode({ id: 'vpc', type: 'container', x: 0, y: 50, width: 500, data: { iceType: 'Network.VPC' } });
    const lb = makeNode({
      id: 'lb',
      x: 100,
      y: 200,
      width: 100,
      parentId: 'vpc',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([vpc, lb], []);
    expect(out.nodeIds).toEqual(['lb']);
    // VPC.y = 50, lb walks up to vpc.y = 50, topY = 50, userY = -50
    expect(out.userIconPosition).toEqual({ x: 150, y: -50 });
  });

  it('uses the bare exposed node y when no parent ancestor', () => {
    const lb = makeNode({
      id: 'lb',
      x: 30,
      y: 200,
      width: 60,
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([lb], []);
    // centerX = 30 + 60/2 = 60; topY = 200 - 100 = 100
    expect(out.userIconPosition).toEqual({ x: 60, y: 100 });
  });

  it('checks Network.Subnet too in the VPC y-scan', () => {
    const subnet = makeNode({
      id: 'sub',
      type: 'container',
      x: 0,
      y: 30,
      width: 500,
      data: { iceType: 'Network.Subnet', visibility: 'public' },
    });
    const lb = makeNode({
      id: 'lb',
      x: 100,
      y: 200,
      width: 100,
      parentId: 'sub',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([subnet, lb], []);
    expect(out.userIconPosition?.y).toBe(-70); // 30 - 100
  });

  it('handles a stray parent reference without ancestor (current === undefined)', () => {
    const lb = makeNode({
      id: 'lb',
      x: 0,
      y: 80,
      width: 100,
      parentId: 'orphan',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([lb], []);
    // Walk-up loop breaks with current=undefined → falls into "if (!current)" → uses node.y
    expect(out.userIconPosition).toEqual({ x: 50, y: -20 });
  });

  it('orphan-parent node does not lower topY when an even-smaller-y VPC exists', () => {
    // VPC at y=10, orphan-parent LB at y=80. Walk-up sets current=undefined so the
    // !current branch fires; the inner `if (node.y < topY)` should be FALSE because
    // 80 >= 10.
    const vpc = makeNode({
      id: 'vpc',
      type: 'container',
      x: 0,
      y: 10,
      width: 500,
      data: { iceType: 'Network.VPC' },
    });
    const lb = makeNode({
      id: 'lb',
      x: 0,
      y: 80,
      width: 100,
      parentId: 'orphan',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([vpc, lb], []);
    // topY must come from VPC.y=10
    expect(out.userIconPosition?.y).toBe(-90);
  });
});

describe('useExposedServices — defaults for missing iceType (|| fallback branches)', () => {
  it('handles a candidate node with no iceType key at all (uses ENTRY check fallback to false)', () => {
    // Node with no iceType — fails NEVER_EXPOSED_TYPES check (empty string),
    // fails ENTRY_TYPES, no domain → not a candidate
    const out = captureHook(
      [makeNode({ id: 'n1', data: { exposed: true } })],
      [],
    );
    // Explicit exposed=true short-circuits regardless
    expect(out.nodeIds).toEqual(['n1']);
  });

  it('handles a parent container with no iceType key (private-subnet check falls through)', () => {
    const parent = makeNode({
      id: 'p',
      type: 'container',
      data: { /* no iceType */ },
    });
    const lb = makeNode({
      id: 'lb',
      x: 0,
      y: 100,
      width: 100,
      parentId: 'p',
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([parent, lb], []);
    // Parent has no Network.Subnet iceType → not flagged as private subnet → exposed
    expect(out.nodeIds).toEqual(['lb']);
  });

  it('frontend filter handles a Group.Frontend with sibling node lacking iceType', () => {
    const frontend = makeNode({
      id: 'fe',
      type: 'container',
      data: { iceType: 'Group.Frontend' },
    });
    const fallback = makeNode({
      id: 'rand',
      data: { /* no iceType */ },
    });
    const lb = makeNode({
      id: 'lb',
      x: 0,
      y: 100,
      width: 100,
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([frontend, fallback, lb], []);
    // 'rand' has no iceType, but it's not exposed anyway → output stays unchanged
    expect(out.nodeIds.includes('lb')).toBe(true);
  });

  it('VPC filter handles a sibling node lacking iceType (uses || fallback)', () => {
    const vpc = makeNode({
      id: 'vpc',
      type: 'container',
      x: 0,
      y: 0,
      width: 500,
      data: { iceType: 'Network.VPC' },
    });
    const orphan = makeNode({
      id: 'orphan',
      data: { /* no iceType */ },
    });
    const lb = makeNode({
      id: 'lb',
      x: 100,
      y: 200,
      width: 100,
      data: { iceType: 'Network.LoadBalancer' },
    });
    const out = captureHook([vpc, orphan, lb], []);
    // The sibling without iceType doesn't crash the VPC filter
    expect(out.nodeIds).toEqual(['lb']);
  });
});

describe('useExposedServices — domain edge case', () => {
  it('treats redis.internal & pg.internal as internal placeholder domains', () => {
    const out = captureHook(
      [
        makeNode({ id: 'a', data: { iceType: 'Custom.X', domain: 'pg.internal' } }),
        makeNode({ id: 'b', data: { iceType: 'Custom.X', domain: 'redis.internal' } }),
      ],
      [],
    );
    expect(out.nodeIds).toEqual([]);
  });
});
