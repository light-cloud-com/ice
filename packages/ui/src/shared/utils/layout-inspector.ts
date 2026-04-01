/**
 * Layout Inspector — Debug tool for canvas layout analysis
 *
 * Logs comprehensive layout state: positions, sizes, gaps, parent-child
 * relations, nesting depth, container bounds, overlap detection, LOD, zoom.
 *
 * Enable:  localStorage.setItem('ice-debug', 'true')
 *          — auto-logs on every zoom change / organize
 *
 * Manual:  window.__iceInspect()
 *          — dumps full state to console at any time
 *
 * Verbose: window.__iceInspect({ verbose: true })
 *          — includes gap matrix between all node pairs
 */

// ─── Types ────────────────────────────────────────────────────────────────

interface InspectNode {
  id: string;
  type: string;
  label: string;
  iceType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string | null;
  folded?: boolean;
}

interface InspectEdge {
  id: string;
  source: string;
  target: string;
  relationship?: string;
}

interface InspectState {
  zoom: number;
  lod: number;
  nodes: InspectNode[];
  edges: InspectEdge[];
}

interface InspectOptions {
  verbose?: boolean;
  silent?: boolean; // return data without logging
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  try { return localStorage.getItem('ice-debug') === 'true'; } catch { return false; }
}

function lodLabel(lod: number): string {
  return lod >= 3 ? 'L3 (full)' : lod >= 2 ? 'L2 (compact)' : 'L1 (iconic)';
}

function invZoomDims(zoom: number, lod: number): { w: number; h: number; label: string } {
  const inv = 1 / Math.max(zoom, 0.1);
  if (lod <= 1) return { w: 60 * inv, h: 60 * inv, label: `60/${zoom.toFixed(2)} = ${Math.round(60 * inv)}` };
  if (lod <= 2) return { w: 160 * inv, h: 48 * inv, label: `160/${zoom.toFixed(2)} = ${Math.round(160 * inv)}` };
  return { w: 240, h: 80, label: '240×80' };
}

// ─── Nesting depth ────────────────────────────────────────────────────────

function computeDepths(nodes: InspectNode[]): Map<string, number> {
  const map = new Map<string, number>();
  const getDepth = (id: string): number => {
    if (map.has(id)) return map.get(id)!;
    const node = nodes.find((n) => n.id === id);
    if (!node?.parentId) { map.set(id, 0); return 0; }
    const d = 1 + getDepth(node.parentId);
    map.set(id, d);
    return d;
  };
  for (const n of nodes) getDepth(n.id);
  return map;
}

// ─── Overlap detection ────────────────────────────────────────────────────

interface OverlapInfo {
  nodeA: string;
  nodeB: string;
  overlapX: number;
  overlapY: number;
  area: number;
  relation: 'sibling' | 'unrelated' | 'parent-child';
}

function detectOverlaps(nodes: InspectNode[], gap: number = 0): OverlapInfo[] {
  const overlaps: OverlapInfo[] = [];
  const depths = computeDepths(nodes);

  // Build ancestry
  const isAncestor = (ancestorId: string, nodeId: string): boolean => {
    let current = nodeId;
    while (current) {
      const n = nodes.find((x) => x.id === current);
      if (!n?.parentId) return false;
      if (n.parentId === ancestorId) return true;
      current = n.parentId;
    }
    return false;
  };

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      const ax2 = a.x + a.width;
      const ay2 = a.y + a.height;
      const bx2 = b.x + b.width;
      const by2 = b.y + b.height;

      if (a.x >= bx2 + gap || b.x >= ax2 + gap || a.y >= by2 + gap || b.y >= ay2 + gap) continue;

      const ox = Math.min(ax2 + gap - b.x, bx2 + gap - a.x);
      const oy = Math.min(ay2 + gap - b.y, by2 + gap - a.y);
      const area = Math.max(0, ox) * Math.max(0, oy);

      let relation: OverlapInfo['relation'] = 'unrelated';
      if (isAncestor(a.id, b.id) || isAncestor(b.id, a.id)) {
        relation = 'parent-child';
      } else if (a.parentId === b.parentId) {
        relation = 'sibling';
      }

      overlaps.push({
        nodeA: (a.label || a.id).slice(0, 20),
        nodeB: (b.label || b.id).slice(0, 20),
        overlapX: Math.round(ox),
        overlapY: Math.round(oy),
        area: Math.round(area),
        relation,
      });
    }
  }
  return overlaps;
}

// ─── Gap analysis ─────────────────────────────────────────────────────────

interface GapInfo {
  nodeA: string;
  nodeB: string;
  gapX: number;  // negative = overlap
  gapY: number;
  minGap: number;
  relation: string;
}

function computeGaps(nodes: InspectNode[]): GapInfo[] {
  const gaps: GapInfo[] = [];
  const topLevel = nodes.filter((n) => !n.parentId);

  for (let i = 0; i < topLevel.length; i++) {
    for (let j = i + 1; j < topLevel.length; j++) {
      const a = topLevel[i];
      const b = topLevel[j];

      // Gap = distance between nearest edges (negative = overlap)
      const gapLeft = b.x - (a.x + a.width);     // b is right of a
      const gapRight = a.x - (b.x + b.width);     // a is right of b
      const gapTop = b.y - (a.y + a.height);      // b is below a
      const gapBottom = a.y - (b.y + b.height);   // a is below b

      const gapX = Math.max(gapLeft, gapRight);
      const gapY = Math.max(gapTop, gapBottom);

      gaps.push({
        nodeA: (a.label || a.id).slice(0, 18),
        nodeB: (b.label || b.id).slice(0, 18),
        gapX: Math.round(gapX),
        gapY: Math.round(gapY),
        minGap: Math.round(Math.max(gapX, gapY)),
        relation: 'top-level',
      });
    }
  }
  return gaps;
}

// ─── Container bounds analysis ────────────────────────────────────────────

interface ContainerInfo {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
  childrenFit: boolean;  // do all children fit within bounds?
  overflow: { nodeLabel: string; side: string }[];
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
}

function analyzeContainers(nodes: InspectNode[]): ContainerInfo[] {
  const containers = nodes.filter((n) => n.type === 'container' || n.type === 'group');
  return containers.map((c) => {
    const children = nodes.filter((n) => n.parentId === c.id);
    const overflow: ContainerInfo['overflow'] = [];

    let childMinX = Infinity, childMinY = Infinity, childMaxX = -Infinity, childMaxY = -Infinity;
    for (const ch of children) {
      childMinX = Math.min(childMinX, ch.x);
      childMinY = Math.min(childMinY, ch.y);
      childMaxX = Math.max(childMaxX, ch.x + ch.width);
      childMaxY = Math.max(childMaxY, ch.y + ch.height);

      if (ch.x < c.x) overflow.push({ nodeLabel: (ch.label || ch.id).slice(0, 15), side: 'left' });
      if (ch.y < c.y) overflow.push({ nodeLabel: (ch.label || ch.id).slice(0, 15), side: 'top' });
      if (ch.x + ch.width > c.x + c.width) overflow.push({ nodeLabel: (ch.label || ch.id).slice(0, 15), side: 'right' });
      if (ch.y + ch.height > c.y + c.height) overflow.push({ nodeLabel: (ch.label || ch.id).slice(0, 15), side: 'bottom' });
    }

    return {
      id: c.id.slice(0, 20),
      label: (c.label || c.id).slice(0, 20),
      x: Math.round(c.x),
      y: Math.round(c.y),
      width: Math.round(c.width),
      height: Math.round(c.height),
      childCount: children.length,
      childrenFit: overflow.length === 0,
      overflow,
      paddingLeft: children.length ? Math.round(childMinX - c.x) : 0,
      paddingTop: children.length ? Math.round(childMinY - c.y) : 0,
      paddingRight: children.length ? Math.round((c.x + c.width) - childMaxX) : 0,
      paddingBottom: children.length ? Math.round((c.y + c.height) - childMaxY) : 0,
    };
  });
}

// ─── Main inspect function ────────────────────────────────────────────────

export interface InspectResult {
  zoom: number;
  lod: number;
  lodLabel: string;
  invZoomVisualSize: string;
  nodeCount: number;
  edgeCount: number;
  maxNestingDepth: number;
  nodes: Array<{
    label: string;
    type: string;
    iceType: string;
    x: number;
    y: number;
    w: number;
    h: number;
    depth: number;
    parent: string;
    childCount: number;
    folded: boolean;
  }>;
  containers: ContainerInfo[];
  overlaps: {
    total: number;
    collisions: number;  // non parent-child overlaps
    details: OverlapInfo[];
  };
  gaps?: GapInfo[];
}

export function inspectLayout(state: InspectState, opts: InspectOptions = {}): InspectResult {
  const { zoom, lod, nodes, edges } = state;
  const depths = computeDepths(nodes);
  const vizDims = invZoomDims(zoom, lod);

  // Node table
  const nodeTable = nodes.map((n) => {
    const depth = depths.get(n.id) || 0;
    const children = nodes.filter((c) => c.parentId === n.id);
    return {
      label: (n.label || n.id).slice(0, 22),
      type: n.type,
      iceType: (n.iceType || '').slice(0, 20),
      x: Math.round(n.x),
      y: Math.round(n.y),
      w: Math.round(n.width),
      h: Math.round(n.height),
      depth,
      parent: n.parentId ? (nodes.find((p) => p.id === n.parentId)?.label || n.parentId).slice(0, 15) : '—',
      childCount: children.length,
      folded: !!n.folded,
    };
  });

  const containers = analyzeContainers(nodes);
  const allOverlaps = detectOverlaps(nodes);
  const collisions = allOverlaps.filter((o) => o.relation !== 'parent-child');
  const gaps = opts.verbose ? computeGaps(nodes) : undefined;
  const maxDepth = Math.max(0, ...Array.from(depths.values()));

  const result: InspectResult = {
    zoom: Math.round(zoom * 100) / 100,
    lod,
    lodLabel: lodLabel(lod),
    invZoomVisualSize: vizDims.label,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    maxNestingDepth: maxDepth,
    nodes: nodeTable,
    containers,
    overlaps: {
      total: allOverlaps.length,
      collisions: collisions.length,
      details: collisions,
    },
    gaps,
  };

  if (!opts.silent) {
    logResult(result, opts);
  }

  return result;
}

// ─── Console output ───────────────────────────────────────────────────────

function logResult(r: InspectResult, opts: InspectOptions = {}): void {
  const c = {
    header: 'color: #3b82f6; font-weight: bold; font-size: 13px',
    section: 'color: #8b5cf6; font-weight: bold',
    ok: 'color: #22c55e; font-weight: bold',
    warn: 'color: #f59e0b; font-weight: bold',
    error: 'color: #ef4444; font-weight: bold',
    dim: 'color: #64748b',
    reset: 'color: inherit',
  };

  // ── Header ──────────────────────────────────────────────────────────
  console.log(
    `%c[ICE Layout Inspector]%c  zoom=${r.zoom} (${Math.round(r.zoom * 100)}%)  ${r.lodLabel}  visual=${r.invZoomVisualSize}  nodes=${r.nodeCount}  edges=${r.edgeCount}  maxDepth=${r.maxNestingDepth}`,
    c.header, c.reset,
  );

  // ── Node table ──────────────────────────────────────────────────────
  console.groupCollapsed('%c Nodes', c.section);
  console.table(r.nodes);
  console.groupEnd();

  // ── Containers ──────────────────────────────────────────────────────
  if (r.containers.length > 0) {
    console.groupCollapsed('%c Containers', c.section);
    for (const ct of r.containers) {
      const status = ct.childrenFit
        ? '%c✓ children fit%c'
        : '%c⚠ OVERFLOW%c';
      const statusColor = ct.childrenFit ? c.ok : c.error;
      console.log(
        `  ${ct.label.padEnd(20)} ${ct.width}×${ct.height} at (${ct.x},${ct.y})  children=${ct.childCount}  pad=[${ct.paddingLeft},${ct.paddingTop},${ct.paddingRight},${ct.paddingBottom}]  ${status}`,
        statusColor, c.reset,
      );
      if (ct.overflow.length > 0) {
        for (const ov of ct.overflow) {
          console.log(`    %c↳ ${ov.nodeLabel} overflows ${ov.side}`, c.error);
        }
      }
    }
    console.groupEnd();
  }

  // ── Overlaps ────────────────────────────────────────────────────────
  if (r.overlaps.collisions > 0) {
    console.log(`%c ⚠ ${r.overlaps.collisions} COLLISIONS (non parent-child overlaps):`, c.error);
    for (const o of r.overlaps.details) {
      console.log(
        `    %c${o.nodeA}%c ↔ %c${o.nodeB}%c  overlapX=${o.overlapX} overlapY=${o.overlapY} area=${o.area}px²  (${o.relation})`,
        c.warn, c.reset, c.warn, c.reset,
      );
    }
  } else {
    console.log('%c ✓ No collisions between unrelated nodes', c.ok);
  }

  // ── Parent-child overlaps (expected) ────────────────────────────────
  const pcOverlaps = r.overlaps.total - r.overlaps.collisions;
  if (pcOverlaps > 0) {
    console.log(`%c   ${pcOverlaps} parent-child overlaps (expected)`, c.dim);
  }

  // ── Gap matrix (verbose) ────────────────────────────────────────────
  if (opts.verbose && r.gaps) {
    console.groupCollapsed('%c Top-level gaps', c.section);
    console.table(r.gaps);
    console.groupEnd();
  }
}

// ─── Window binding for manual use ────────────────────────────────────────

let _lastState: InspectState | null = null;

/** Call from svg-canvas on each render/zoom change to keep state fresh */
export function updateInspectorState(state: InspectState): void {
  _lastState = state;
}

/** Expose on window for manual console use */
export function installInspector(): void {
  if (typeof window === 'undefined') return;
  (window as any).__iceInspect = (opts?: InspectOptions) => {
    if (!_lastState) {
      console.warn('[ICE Inspector] No state available. Open a canvas first.');
      return null;
    }
    return inspectLayout(_lastState, opts);
  };
  (window as any).__iceInspectVerbose = () => {
    return (window as any).__iceInspect?.({ verbose: true });
  };
}
