/**
 * Overlap regression for auto-layout.
 *
 * Simulates the Static Site card (8 nodes, 4 flow edges, no containment)
 * and asserts that every pair of unrelated top-level nodes has a gap ≥ 1px
 * after dagre + repack. Catches the "blocks overlap" class of bugs purely
 * from the geometry, no browser required.
 */

import { describe, it, expect } from 'vitest';
import { autoLayout, type LayoutNode } from '../auto-layout';

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function overlapPairs(rects: Rect[], gap = 0): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i], rects[j], gap)) pairs.push([rects[i].id, rects[j].id]);
    }
  }
  return pairs;
}

function mk(
  id: string,
  iceType: string,
  data: Record<string, unknown> = {},
  parentId: string | null = null,
): LayoutNode {
  return {
    id,
    type: iceType.startsWith('Group.') || iceType === 'Network.PrivateNetwork' ? 'container' : 'resource',
    iceType,
    label: id,
    parentId,
    width: 240,
    height: 160,
    x: 0,
    y: 0,
    data: { iceType, ...data },
  };
}

describe('autoLayout — no-overlap invariants', () => {
  it('static-site card: no two top-level nodes overlap after TB organize', () => {
    const nodes: LayoutNode[] = [
      mk('cd', 'Network.CustomDomain', {
        routes: [
          { id: 'r1', subdomain: 'asd' },
          { id: 'r2', subdomain: 'xfcgvb' },
        ],
      }),
      mk('gh', 'Source.Repository'),
      mk('ss1', 'Compute.StaticSite'),
      mk('ss2', 'Compute.StaticSite'),
      mk('pn', 'Network.PrivateNetwork'),
      mk('cron', 'Compute.CronJob'),
      mk('rabbit', 'Messaging.RabbitMQ'),
      mk('sched', 'Compute.CronJob'),
    ];

    const edges = [
      { source: 'cd', target: 'ss1', relationship: 'connects_to' },
      { source: 'cd', target: 'ss2', relationship: 'connects_to' },
      { source: 'gh', target: 'ss1', relationship: 'connects_to' },
      { source: 'gh', target: 'ss2', relationship: 'connects_to' },
    ];

    const { nodes: out } = autoLayout(nodes, edges, { direction: 'vertical' });

    const rects: Rect[] = out.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
    const bad = overlapPairs(rects);

    expect(bad, `overlapping pairs: ${JSON.stringify(bad)}\nrects: ${JSON.stringify(rects, null, 2)}`).toEqual([]);
  });

  it('static-site card: every pair has at least 8px clearance after TB organize', () => {
    const nodes: LayoutNode[] = [
      mk('cd', 'Network.CustomDomain', { routes: [{ id: 'r1', subdomain: 'a' }] }),
      mk('gh', 'Source.Repository'),
      mk('ss1', 'Compute.StaticSite'),
      mk('ss2', 'Compute.StaticSite'),
      mk('pn', 'Network.PrivateNetwork'),
      mk('cron', 'Compute.CronJob'),
      mk('rabbit', 'Messaging.RabbitMQ'),
    ];
    const edges = [
      { source: 'cd', target: 'ss1', relationship: 'connects_to' },
      { source: 'gh', target: 'ss2', relationship: 'connects_to' },
    ];
    const { nodes: out } = autoLayout(nodes, edges, { direction: 'vertical' });
    const rects: Rect[] = out.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
    const tight = overlapPairs(rects, 8);
    expect(tight, `pairs closer than 8px: ${JSON.stringify(tight)}`).toEqual([]);
  });

  it('container with children: children stay inside parent bounds', () => {
    const nodes: LayoutNode[] = [
      mk('pn', 'Network.PrivateNetwork'),
      mk('c1', 'Compute.CronJob', {}, 'pn'),
      mk('c2', 'Messaging.RabbitMQ', {}, 'pn'),
    ];
    const { nodes: out } = autoLayout(nodes, [], { direction: 'vertical' });
    const byId = new Map(out.map((n) => [n.id, n]));
    const pn = byId.get('pn')!;
    for (const cid of ['c1', 'c2']) {
      const c = byId.get(cid)!;
      const inside =
        c.x >= pn.x && c.y >= pn.y && c.x + c.width <= pn.x + pn.width && c.y + c.height <= pn.y + pn.height;
      expect(
        inside,
        `${cid} at ${JSON.stringify({ x: c.x, y: c.y, w: c.width, h: c.height })} escapes parent ${JSON.stringify({ x: pn.x, y: pn.y, w: pn.width, h: pn.height })}`,
      ).toBe(true);
    }
  });

  it('LR direction: static-site card has no overlaps', () => {
    const nodes: LayoutNode[] = [
      mk('cd', 'Network.CustomDomain'),
      mk('gh', 'Source.Repository'),
      mk('ss1', 'Compute.StaticSite'),
      mk('ss2', 'Compute.StaticSite'),
      mk('pn', 'Network.PrivateNetwork'),
      mk('cron', 'Compute.CronJob'),
    ];
    const edges = [
      { source: 'cd', target: 'ss1', relationship: 'connects_to' },
      { source: 'gh', target: 'ss2', relationship: 'connects_to' },
    ];
    const { nodes: out } = autoLayout(nodes, edges, { direction: 'horizontal' });
    const rects: Rect[] = out.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }));
    const bad = overlapPairs(rects);
    expect(bad, `overlaps: ${JSON.stringify(bad)}`).toEqual([]);
  });
});
