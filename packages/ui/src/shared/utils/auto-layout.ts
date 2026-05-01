/**
 * Auto-Layout — Dagre-based hierarchical tree layout.
 *
 * Nested containers are handled bottom-up: each container's children are laid
 * out with dagre first, the container is then sized to fit them, and the sized
 * container surfaces as a single node in its parent's dagre graph.
 *
 * Modes:
 *   'flow'     — dagre hierarchical tree (vertical=TB, horizontal=LR)
 *   'circular' — concentric-ring fallback (children arranged around parent center)
 *   'grid'     — alias of 'flow' (legacy — routed through dagre)
 */

import { LAYOUT_GRID_STEP as GRID_STEP } from '@ice/constants';
import { MIN_CONTAINER_WIDTH, MIN_CONTAINER_HEIGHT } from '../../config/canvas-constants';
import { isContainer as isContainerType } from '../../config/containment-rules';
import {
  DEFAULT_OPTIONS,
  type LayoutNode,
  type LayoutEdge,
  type LayoutResult,
  type LayoutOptions,
} from './auto-layout/types';
import { resolveVisualSize } from './auto-layout/visual-size';
import { buildHierarchy, collectRootIds, buildPostOrder } from './auto-layout/hierarchy';
import { absolutizeAll, snapToGrid } from './auto-layout/transformers';
import { dagreTreeLayout } from './auto-layout/algorithms/dagre-tree';

export type { LayoutNode, LayoutEdge, Point, LayoutResult } from './auto-layout/types';

// =============================================================================
// Public entry point
// =============================================================================

export function autoLayout(nodes: LayoutNode[], edges: LayoutEdge[], options: LayoutOptions = {}): LayoutResult {
  if (nodes.length === 0) return { nodes: [], edgeRoutes: new Map() };
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.layout === 'circular') {
    return circularLayout(nodes, edges, opts);
  }
  return dagreTreeLayout(nodes, edges, opts);
}

// =============================================================================
// Circular (concentric rings) layout
// =============================================================================

function circularLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: Required<LayoutOptions>): LayoutResult {
  const { childrenOf } = buildHierarchy(nodes, edges);

  const nodeMap = new Map<string, LayoutNode>();
  for (const n of nodes) {
    const visual = resolveVisualSize(n);
    nodeMap.set(n.id, { ...n, width: visual.width, height: visual.height });
  }

  const rootIds = collectRootIds(nodes, nodeMap);
  const groupOrder = buildPostOrder(rootIds, childrenOf);

  const containerSize = new Map<string, { width: number; height: number }>();
  const relPos = new Map<string, { x: number; y: number }>();

  for (const ownerId of groupOrder) {
    const kids = ownerId === null ? rootIds : (childrenOf.get(ownerId) ?? []);
    if (kids.length === 0) continue;

    const sizes = kids.map((kid) => {
      const kidNode = nodeMap.get(kid)!;
      return containerSize.get(kid) ?? { width: kidNode.width, height: kidNode.height };
    });
    const maxW = Math.max(...sizes.map((s) => s.width));
    const maxH = Math.max(...sizes.map((s) => s.height));

    // Radius so that adjacent siblings don't overlap on the ring.
    const minArc = Math.max(maxW, maxH) + opts.nodeGap;
    const radius = kids.length === 1 ? 0 : Math.max((minArc * kids.length) / (2 * Math.PI), minArc);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    kids.forEach((kid, i) => {
      const size = sizes[i];
      const angle = kids.length === 1 ? 0 : (i / kids.length) * 2 * Math.PI - Math.PI / 2;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      const x = cx - size.width / 2;
      const y = cy - size.height / 2;
      relPos.set(kid, { x, y });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + size.width > maxX) maxX = x + size.width;
      if (y + size.height > maxY) maxY = y + size.height;
    });

    // Mirror the dagre path: grid-aligned padding so snap is a no-op for the
    // inset (and bottom padding doesn't get eaten).
    const originX = ownerId === null ? opts.startX : GRID_STEP;
    const originY = ownerId === null ? opts.startY : GRID_STEP * 2;
    const dx = originX - minX;
    const dy = originY - minY;
    for (const kid of kids) {
      const p = relPos.get(kid)!;
      relPos.set(kid, { x: p.x + dx, y: p.y + dy });
    }

    if (ownerId !== null) {
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const owner = nodeMap.get(ownerId)!;
      containerSize.set(ownerId, {
        width: Math.max(contentW + GRID_STEP * 2, MIN_CONTAINER_WIDTH, owner.width),
        height: Math.max(contentH + GRID_STEP * 3, MIN_CONTAINER_HEIGHT, owner.height),
      });
    }
  }

  absolutizeAll(rootIds, nodeMap, childrenOf, relPos, containerSize);
  snapToGrid(nodeMap);
  return { nodes: Array.from(nodeMap.values()), edgeRoutes: new Map() };
}

// =============================================================================
// Z-Index (used by svg-canvas.tsx and z-index-depth.test.ts)
// =============================================================================

export function calculateZIndex(iceType: string, depth: number = 0): number {
  if (iceType === 'Network.VPC') return 0 + depth;
  if (iceType === 'Network.Subnet') return 10 + depth;
  if (iceType.startsWith('Group.')) return 15 + depth;
  if (isContainerType(iceType)) return 20 + depth;
  return 100 + depth;
}

// =============================================================================
// Force-directed collision resolution (post-layout safety net)
// =============================================================================

interface ForceBody {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string | null;
  /** Internal – velocity */
  vx?: number;
  vy?: number;
}

/**
 * Resolves rectangular overlaps between top-level nodes by applying a short
 * velocity-damped simulation. Mutates x/y in place. Descendants move with
 * their top-level ancestor. Nodes sharing an ancestry chain never collide.
 */
export function forceResolveOverlaps<T extends ForceBody>(
  allNodes: T[],
  gap: number = 12,
  ticks: number = 60,
  strength: number = 0.8,
): void {
  if (allNodes.length < 2) return;

  const nodeById = new Map<string, T>();
  for (const n of allNodes) nodeById.set(n.id, n);

  const descOf = new Map<string, Set<string>>();
  const getDesc = (id: string): Set<string> => {
    const cached = descOf.get(id);
    if (cached) return cached;
    const s = new Set<string>();
    descOf.set(id, s);
    for (const n of allNodes) {
      if (n.parentId === id) {
        s.add(n.id);
        for (const d of getDesc(n.id)) s.add(d);
      }
    }
    return s;
  };
  for (const n of allNodes) getDesc(n.id);

  const isRelated = (a: T, b: T): boolean => descOf.get(a.id)!.has(b.id) || descOf.get(b.id)!.has(a.id);

  const topLevel = allNodes.filter((n) => !n.parentId || !nodeById.has(n.parentId));
  if (topLevel.length < 2) return;

  for (const n of topLevel) {
    n.vx = 0;
    n.vy = 0;
  }

  const shiftTree = (node: T, dx: number, dy: number) => {
    node.x += dx;
    node.y += dy;
    const desc = descOf.get(node.id);
    if (!desc) return;
    for (const did of desc) {
      const d = nodeById.get(did);
      if (d) {
        d.x += dx;
        d.y += dy;
      }
    }
  };

  const damping = 0.4;

  for (let tick = 0; tick < ticks; tick++) {
    const alpha = strength * (1 - tick / ticks);
    if (alpha < 0.01) break;

    for (let i = 0; i < topLevel.length; i++) {
      for (let j = i + 1; j < topLevel.length; j++) {
        const a = topLevel[i];
        const b = topLevel[j];
        if (isRelated(a, b)) continue;

        const ax2 = a.x + a.width + gap;
        const ay2 = a.y + a.height + gap;
        const bx2 = b.x + b.width + gap;
        const by2 = b.y + b.height + gap;
        if (a.x >= bx2 || b.x >= ax2 || a.y >= by2 || b.y >= ay2) continue;

        const ox = Math.min(ax2 - b.x, bx2 - a.x);
        const oy = Math.min(ay2 - b.y, by2 - a.y);

        if (ox < oy) {
          const force = ox * alpha;
          if (a.x + a.width / 2 < b.x + b.width / 2) {
            a.vx! -= force / 2;
            b.vx! += force / 2;
          } else {
            a.vx! += force / 2;
            b.vx! -= force / 2;
          }
        } else {
          const force = oy * alpha;
          if (a.y + a.height / 2 < b.y + b.height / 2) {
            a.vy! -= force / 2;
            b.vy! += force / 2;
          } else {
            a.vy! += force / 2;
            b.vy! -= force / 2;
          }
        }
      }
    }

    for (const n of topLevel) {
      if (n.vx !== 0 || n.vy !== 0) {
        shiftTree(n, n.vx!, n.vy!);
        n.vx! *= damping;
        n.vy! *= damping;
      }
    }
  }

  for (const n of allNodes) {
    delete n.vx;
    delete n.vy;
  }
}
