/**
 * rf-canv-5 — verbatim regression for the canvas-node-sizing util.
 *
 * `computeNodeSizes` + `toLocalCanvasNode` lift the inline reducer body
 * out of `svg-canvas.tsx`'s `canvasNodes` useMemo. Each test below pins
 * one slice of the original semantics: dispatch arms, fold short-circuits,
 * the Math.max width clamp, and the projection's fallback chain.
 *
 * The compact / custom-domain / private-network sizing helpers are mocked
 * to predictable constants so the dispatch (which arm runs) is observable
 * separately from the helper internals.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../components/nodes/compact-node', () => ({
  computeCompactNodeWidth: vi.fn((isBlock: boolean) => (isBlock ? 221 : 220)),
  computeCompactNodeHeight: vi.fn(
    (_data: Record<string, unknown>, isBlock: boolean, hasPipelineStatus: boolean) =>
      80 + (isBlock ? 1 : 0) + (hasPipelineStatus ? 10 : 0),
  ),
}));

vi.mock('../../components/nodes/custom-domain', () => ({
  computeCustomDomainWidth: vi.fn(() => 280),
  computeCustomDomainHeight: vi.fn((data: Record<string, unknown>) => {
    const routes = (data?.routes as unknown[]) || [];
    return 100 + routes.length * 24;
  }),
}));

vi.mock('../../components/nodes/private-network', () => ({
  computePrivateNetworkWidth: vi.fn((current: number) => Math.max(current, 320)),
  computePrivateNetworkHeight: vi.fn((current: number) => Math.max(current, 200)),
}));

import {
  computeNodeSizes,
  toLocalCanvasNode,
  type SizingInputNode,
} from '../canvas-node-sizing';

/** Minimal Redux-shape node factory — only the fields these utils read. */
function n(overrides: Partial<SizingInputNode> & Pick<SizingInputNode, 'id'>): SizingInputNode {
  return {
    type: 'resource',
    position: { x: 0, y: 0 },
    width: 0,
    height: 0,
    data: {},
    ...overrides,
  };
}

// =============================================================================
// computeNodeSizes — dispatch arms
// =============================================================================

describe('computeNodeSizes — compact path', () => {
  it('returns compact-helper widths/heights for a regular resource node', () => {
    const node = n({ id: 'r1', type: 'resource', data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    // isBlock=false, isGroup=false → compact width with isBlock=false (220), height=80
    expect(sizes.defaultWidth).toBe(220);
    expect(sizes.defaultHeight).toBe(80);
  });

  it('honors hasPipelineStatus in the compact-height helper', () => {
    const node = n({ id: 'r1', type: 'resource', data: { iceType: 'Compute.Service' } });
    const withStatus = computeNodeSizes(node, true);
    expect(withStatus.defaultHeight).toBe(90);
  });

  it('uses the (isBlock || isGroup) branch for type=block', () => {
    const node = n({ id: 'b1', type: 'block', data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    // isBlock=true → compact width with isBlock=true (221), height=81
    expect(sizes.defaultWidth).toBe(221);
    expect(sizes.defaultHeight).toBe(81);
  });
});

describe('computeNodeSizes — custom domain path', () => {
  it('returns custom-domain widths/heights when iceType=Network.CustomDomain', () => {
    const node = n({ id: 'cd1', type: 'block', data: { iceType: 'Network.CustomDomain', routes: [{}, {}] } });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.defaultWidth).toBe(280);
    expect(sizes.defaultHeight).toBe(148); // 100 + 2*24
  });

  it('expandedHeight equals defaultHeight even when node.height is larger (CD short-circuit)', () => {
    const node = n({ id: 'cd1', data: { iceType: 'Network.CustomDomain' }, height: 9999 });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.expandedHeight).toBe(sizes.defaultHeight);
    expect(sizes.expandedHeight).not.toBe(9999);
  });
});

describe('computeNodeSizes — private network path', () => {
  it('returns private-network widths/heights when iceType=Network.PrivateNetwork', () => {
    const node = n({
      id: 'pn1',
      type: 'container',
      data: { iceType: 'Network.PrivateNetwork' },
      width: 500,
      height: 400,
    });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.defaultWidth).toBe(500); // max(500, 320)
    expect(sizes.defaultHeight).toBe(400); // max(400, 200)
  });

  it('expandedHeight equals defaultHeight (PN short-circuit, never Math.max with node.height)', () => {
    const node = n({ id: 'pn1', data: { iceType: 'Network.PrivateNetwork' }, height: 9999 });
    const sizes = computeNodeSizes(node, false);
    // node.height (9999) is larger than min (200), but the short-circuit still routes through
    // computePrivateNetworkHeight(node.height || 0), which honors the user-set height.
    expect(sizes.expandedHeight).toBe(sizes.defaultHeight);
    expect(sizes.defaultHeight).toBe(9999);
  });
});

describe('computeNodeSizes — group container path', () => {
  it('passes isGroup=true to compact width when node.type=container', () => {
    const node = n({ id: 'g1', type: 'container', data: { iceType: 'Group.Microservice' } });
    const sizes = computeNodeSizes(node, false);
    // isGroup=true (Group.* prefix matches isGroupContainer) → compact width with isBlock=true (221)
    expect(sizes.defaultWidth).toBe(221);
  });

  it('treats type=group cast same as group container (isGroupContainer truth)', () => {
    const node = n({ id: 'g1', type: 'group', data: { iceType: 'Other' } });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.defaultWidth).toBe(221);
  });
});

// =============================================================================
// computeNodeSizes — folded short-circuits
// =============================================================================

describe('computeNodeSizes — folded short-circuits', () => {
  it('folded group → visualHeight=36', () => {
    const node = n({
      id: 'g1',
      type: 'container',
      data: { iceType: 'Group.Microservice', folded: true },
    });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.visualHeight).toBe(36);
  });

  it('folded block/resource → visualHeight=38', () => {
    const node = n({ id: 'b1', type: 'block', data: { iceType: 'Compute.Service', folded: true } });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.visualHeight).toBe(38);
  });

  it('folded custom domain → visualHeight=defaultHeight (CD ignores fold)', () => {
    const node = n({ id: 'cd1', data: { iceType: 'Network.CustomDomain', folded: true } });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.visualHeight).toBe(sizes.defaultHeight);
    expect(sizes.visualHeight).not.toBe(38);
  });

  it('folded private network → visualHeight=defaultHeight (PN ignores fold)', () => {
    const node = n({ id: 'pn1', data: { iceType: 'Network.PrivateNetwork', folded: true } });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.visualHeight).toBe(sizes.defaultHeight);
    expect(sizes.visualHeight).not.toBe(36);
    expect(sizes.visualHeight).not.toBe(38);
  });

  it('expanded with explicit node.height larger than default → expandedHeight=node.height', () => {
    const node = n({ id: 'r1', type: 'resource', data: { iceType: 'Compute.Service' }, height: 500 });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.expandedHeight).toBe(500);
  });

  it('expanded with explicit node.height smaller than default → expandedHeight=default', () => {
    const node = n({ id: 'r1', type: 'resource', data: { iceType: 'Compute.Service' }, height: 10 });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.expandedHeight).toBe(80);
  });

  it('non-folded passes through expandedHeight as visualHeight', () => {
    const node = n({ id: 'r1', type: 'resource', data: { iceType: 'Compute.Service' }, height: 500 });
    const sizes = computeNodeSizes(node, false);
    expect(sizes.visualHeight).toBe(sizes.expandedHeight);
    expect(sizes.visualHeight).toBe(500);
  });
});

// =============================================================================
// toLocalCanvasNode — projection shape
// =============================================================================

describe('toLocalCanvasNode — projection shape', () => {
  it('populates id/type/x/y/width/height/label/data/parentId from the source', () => {
    const node = n({
      id: 'a1',
      type: 'block',
      position: { x: 100, y: 200 },
      width: 250,
      height: 90,
      parentId: 'parent-1',
      data: { iceType: 'Compute.Service', name: 'my-service' },
    });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.id).toBe('a1');
    expect(local.type).toBe('block');
    expect(local.x).toBe(100);
    expect(local.y).toBe(200);
    expect(local.height).toBe(sizes.visualHeight);
    expect(local.width).toBeGreaterThanOrEqual(sizes.defaultWidth);
    expect(local.label).toBe('my-service');
    expect(local.parentId).toBe('parent-1');
    expect((local.data as { iceType: string }).iceType).toBe('Compute.Service');
  });

  it('falls back type to "resource" when source type is missing', () => {
    const node: SizingInputNode = { id: 'x1', position: { x: 0, y: 0 }, data: { iceType: 'Compute.Service' } };
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.type).toBe('resource');
  });

  it('clamps width up to defaultWidth when source width is smaller', () => {
    const node = n({ id: 'r1', width: 50, data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.width).toBe(220); // sizes.defaultWidth, not 50
  });

  it('keeps node.width when it is larger than defaultWidth (Math.max)', () => {
    const node = n({ id: 'r1', width: 999, data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.width).toBe(999);
  });

  it('treats missing node.width as 0 in the Math.max clamp', () => {
    const node: SizingInputNode = {
      id: 'r1',
      type: 'resource',
      position: { x: 0, y: 0 },
      data: { iceType: 'Compute.Service' },
    };
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.width).toBe(220);
  });

  it('label falls back to data.label when data.name is missing', () => {
    const node = n({ id: 'r1', data: { iceType: 'Compute.Service', label: 'my-label' } });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.label).toBe('my-label');
  });

  it('label falls back to id when both data.name and data.label are missing', () => {
    const node = n({ id: 'r1', data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.label).toBe('r1');
  });

  it('data.iceType injection defaults to "Resource.Unknown" when source iceType missing', () => {
    const node = n({ id: 'r1', data: {} });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect((local.data as { iceType: string }).iceType).toBe('Resource.Unknown');
  });

  it('data.iceType is always present even if data is undefined on the source', () => {
    const node: SizingInputNode = { id: 'r1', position: { x: 0, y: 0 } };
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect((local.data as { iceType: string }).iceType).toBe('Resource.Unknown');
  });

  it('parentId normalizes undefined → null', () => {
    const node = n({ id: 'r1', data: { iceType: 'Compute.Service' } });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.parentId).toBeNull();
  });

  it('x/y default to 0 when position is missing', () => {
    const node: SizingInputNode = { id: 'r1', data: { iceType: 'Compute.Service' } };
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect(local.x).toBe(0);
    expect(local.y).toBe(0);
  });

  it('preserves additional data properties through the spread', () => {
    const node = n({
      id: 'r1',
      data: { iceType: 'Compute.Service', custom: 'value', count: 42 },
    });
    const sizes = computeNodeSizes(node, false);
    const local = toLocalCanvasNode(node, false, sizes);
    expect((local.data as { custom: string }).custom).toBe('value');
    expect((local.data as { count: number }).count).toBe(42);
  });
});
