/**
 * Tests for the layout-inspector debug tool. The runtime contract is:
 *
 *   inspectLayout(state, opts?) → InspectResult
 *     - opts.silent → suppress console output, just return the data
 *     - opts.verbose → include the gap matrix between top-level node pairs
 *
 *   updateInspectorState(state) — caches state for window.__iceInspect
 *   installInspector() — binds __iceInspect / __iceInspectVerbose on window
 *
 * The console-formatting branch (`logResult`) is exercised through the
 * non-silent path with `vi.spyOn(console, ...)` so the layout/error/warn
 * sub-branches are covered without spamming test stdout.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  inspectLayout,
  installInspector,
  updateInspectorState,
  type InspectResult,
} from '../layout-inspector';

// ─── Fixture helpers ────────────────────────────────────────────────────────

interface TestNode {
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

function n(overrides: Partial<TestNode> & Pick<TestNode, 'id'>): TestNode {
  return {
    type: 'block',
    label: overrides.id,
    iceType: 'Compute.Container',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    ...overrides,
  };
}

// ─── inspectLayout — silent path ────────────────────────────────────────────

describe('inspectLayout — top-level result shape (silent)', () => {
  it('returns the expected scalar fields for an empty canvas', () => {
    const result = inspectLayout({ zoom: 1, lod: 3, nodes: [], edges: [] }, { silent: true });
    expect(result.zoom).toBe(1);
    expect(result.lod).toBe(3);
    expect(result.lodLabel).toBe('L3 (full)');
    expect(result.invZoomVisualSize).toBe('240×80'); // L3 fixed dims
    expect(result.nodeCount).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.maxNestingDepth).toBe(0);
    expect(result.nodes).toEqual([]);
    expect(result.containers).toEqual([]);
    expect(result.overlaps).toEqual({ total: 0, collisions: 0, details: [] });
    expect(result.gaps).toBeUndefined();
  });

  it('rounds zoom to two decimal places', () => {
    const result = inspectLayout({ zoom: 0.123456, lod: 1, nodes: [], edges: [] }, { silent: true });
    expect(result.zoom).toBe(0.12);
  });
});

describe('inspectLayout — LOD labels and visual sizes', () => {
  it('returns L1 for lod ≤ 1 with inv-zoom 60-px scaling', () => {
    const r1 = inspectLayout({ zoom: 0.5, lod: 1, nodes: [], edges: [] }, { silent: true });
    expect(r1.lodLabel).toBe('L1 (iconic)');
    expect(r1.invZoomVisualSize).toBe('60/0.50 = 120');
  });

  it('returns L2 for lod === 2 with inv-zoom 160-px scaling', () => {
    const r = inspectLayout({ zoom: 1, lod: 2, nodes: [], edges: [] }, { silent: true });
    expect(r.lodLabel).toBe('L2 (compact)');
    expect(r.invZoomVisualSize).toBe('160/1.00 = 160');
  });

  it('returns L3 with fixed 240×80 visuals for lod ≥ 3', () => {
    const r = inspectLayout({ zoom: 2.5, lod: 4, nodes: [], edges: [] }, { silent: true });
    expect(r.lodLabel).toBe('L3 (full)');
    expect(r.invZoomVisualSize).toBe('240×80');
  });

  it('clamps zoom < 0.1 to a minimum 0.1 for inv-zoom math (avoids /0)', () => {
    // zoom=0 ⇒ inv = 1 / max(0, 0.1) = 10 → 60*10 = 600.
    const r = inspectLayout({ zoom: 0, lod: 1, nodes: [], edges: [] }, { silent: true });
    expect(r.invZoomVisualSize).toBe('60/0.00 = 600');
  });
});

// ─── inspectLayout — node table ──────────────────────────────────────────────

describe('inspectLayout — node table', () => {
  it('builds a row for every node with rounded fields', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [n({ id: 'a', x: 10.7, y: 20.4, width: 30.5, height: 40.4 })],
        edges: [],
      },
      { silent: true },
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      label: 'a',
      type: 'block',
      iceType: 'Compute.Container',
      x: 11,
      y: 20,
      w: 31,
      h: 40,
      depth: 0,
      parent: '—',
      childCount: 0,
      folded: false,
    });
  });

  it('truncates long labels and iceType to fit the table', () => {
    const longLabel = 'x'.repeat(40);
    const longIce = 'y'.repeat(40);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [n({ id: 'lng', label: longLabel, iceType: longIce })],
        edges: [],
      },
      { silent: true },
    );
    // .slice(0, 22) for label, .slice(0, 20) for iceType
    expect(result.nodes[0].label.length).toBe(22);
    expect(result.nodes[0].iceType.length).toBe(20);
  });

  it('falls back to the node id when the label is empty', () => {
    const result = inspectLayout(
      { zoom: 1, lod: 3, nodes: [n({ id: 'no-label-here', label: '' })], edges: [] },
      { silent: true },
    );
    expect(result.nodes[0].label).toBe('no-label-here');
  });

  it('sets depth and parent label for nested nodes', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'root', type: 'container' }),
          n({ id: 'mid', type: 'container', parentId: 'root' }),
          n({ id: 'leaf', parentId: 'mid' }),
        ],
        edges: [],
      },
      { silent: true },
    );
    const leaf = result.nodes.find((x) => x.label === 'leaf')!;
    expect(leaf.depth).toBe(2);
    expect(leaf.parent).toBe('mid');
    expect(result.maxNestingDepth).toBe(2);
  });

  it('truncates the parent label to 15 characters', () => {
    const longLabel = 'x'.repeat(30);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'root', type: 'container', label: longLabel }),
          n({ id: 'leaf', parentId: 'root' }),
        ],
        edges: [],
      },
      { silent: true },
    );
    // The InspectResult nodes don't carry id — find by label. The leaf row
    // is the only one whose `parent` is non-"—".
    const leaf = result.nodes.find((row) => row.parent !== '—')!;
    expect(leaf.parent.length).toBe(15);
    expect(leaf.parent).toBe('x'.repeat(15));
  });

  it('uses parent.id when the parent has no label set', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p-id-only', type: 'container', label: '' }),
          n({ id: 'leaf', parentId: 'p-id-only' }),
        ],
        edges: [],
      },
      { silent: true },
    );
    // The parent label is empty; the node-table parent column uses the
    // parent's label when set, otherwise the parent id (truncated).
    const leaf = result.nodes.find((row) => row.parent !== '—')!;
    expect(leaf.parent).toBe('p-id-only'.slice(0, 15));
  });

  it('emits parent="—" when a parentId points to a missing node', () => {
    // When the parent isn't in the nodes list, `nodes.find(...)` is
    // undefined and the `?? n.parentId` fallback kicks in (truncated).
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [n({ id: 'orphan', parentId: 'missing-parent' })],
        edges: [],
      },
      { silent: true },
    );
    expect(result.nodes[0].parent).toBe('missing-parent');
  });

  it('marks folded:true when the node carries folded=true', () => {
    const result = inspectLayout(
      { zoom: 1, lod: 3, nodes: [n({ id: 'folded', folded: true })], edges: [] },
      { silent: true },
    );
    expect(result.nodes[0].folded).toBe(true);
  });
});

// ─── inspectLayout — containers + overflow ─────────────────────────────────

describe('inspectLayout — containers', () => {
  it('analyses a container and reports children fitting cleanly', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', x: 0, y: 0, width: 300, height: 200 }),
          n({ id: 'c', parentId: 'p', x: 50, y: 50, width: 30, height: 30 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].childCount).toBe(1);
    expect(result.containers[0].childrenFit).toBe(true);
    expect(result.containers[0].overflow).toEqual([]);
    expect(result.containers[0].paddingLeft).toBe(50);
    expect(result.containers[0].paddingTop).toBe(50);
    expect(result.containers[0].paddingRight).toBe(220); // 300 - (50 + 30)
    expect(result.containers[0].paddingBottom).toBe(120); // 200 - (50 + 30)
  });

  it('detects every overflow side simultaneously', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', x: 100, y: 100, width: 100, height: 100 }),
          n({ id: 'c', parentId: 'p', x: 50, y: 50, width: 200, height: 200 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    const sides = result.containers[0].overflow.map((o) => o.side).sort();
    expect(sides).toEqual(['bottom', 'left', 'right', 'top']);
    expect(result.containers[0].childrenFit).toBe(false);
  });

  it('also analyses type==="group" as a container', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [n({ id: 'g', type: 'group', width: 200, height: 200 })],
        edges: [],
      },
      { silent: true },
    );
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0].id).toBe('g');
  });

  it('returns zero padding for a container with no children', () => {
    const result = inspectLayout(
      { zoom: 1, lod: 3, nodes: [n({ id: 'p', type: 'container', width: 200, height: 200 })], edges: [] },
      { silent: true },
    );
    expect(result.containers[0].paddingLeft).toBe(0);
    expect(result.containers[0].paddingTop).toBe(0);
    expect(result.containers[0].paddingRight).toBe(0);
    expect(result.containers[0].paddingBottom).toBe(0);
  });

  it('truncates container ids and labels to <= 20 chars', () => {
    const longId = 'a'.repeat(30);
    const longLabel = 'b'.repeat(30);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [n({ id: longId, type: 'container', label: longLabel, width: 200, height: 200 })],
        edges: [],
      },
      { silent: true },
    );
    expect(result.containers[0].id.length).toBe(20);
    expect(result.containers[0].label.length).toBe(20);
  });

  it('truncates child labels in overflow entries to <= 15 chars', () => {
    const childLabel = 'x'.repeat(30);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', x: 100, y: 100, width: 100, height: 100 }),
          n({ id: 'long-child', label: childLabel, parentId: 'p', x: 50, y: 50, width: 30, height: 30 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.containers[0].overflow[0].nodeLabel.length).toBe(15);
  });

  it('falls back to child id in overflow when label is empty', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', x: 100, y: 100, width: 100, height: 100 }),
          n({ id: 'no-label', label: '', parentId: 'p', x: 50, y: 50, width: 30, height: 30 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.containers[0].overflow[0].nodeLabel).toBe('no-label');
  });
});

// ─── inspectLayout — overlaps ───────────────────────────────────────────────

describe('inspectLayout — overlaps', () => {
  it('reports siblings overlapping with relation=sibling', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', width: 500, height: 500 }),
          n({ id: 'a', parentId: 'p', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', parentId: 'p', x: 50, y: 50, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    // a-b overlap; both share parentId 'p' → sibling.
    const sibling = result.overlaps.details.find((o) => o.relation === 'sibling');
    expect(sibling).toBeDefined();
    expect(sibling!.overlapX).toBeGreaterThan(0);
    expect(sibling!.overlapY).toBeGreaterThan(0);
  });

  it('classifies parent–child overlaps and excludes them from collisions', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p', type: 'container', x: 0, y: 0, width: 200, height: 200 }),
          n({ id: 'c', parentId: 'p', x: 50, y: 50, width: 30, height: 30 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.overlaps.total).toBeGreaterThanOrEqual(1);
    expect(result.overlaps.collisions).toBe(0);
    expect(result.overlaps.details).toEqual([]);
    expect(result.overlaps.details.length).toBe(0);
  });

  it('classifies overlaps between unrelated nodes (different parents) as unrelated', () => {
    // Two distinct containers, each with a child overlapping the OTHER
    // container's child — the two children have different parents, so
    // neither sibling nor parent-child applies.
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'p1', type: 'container', x: 0, y: 0, width: 200, height: 200 }),
          n({ id: 'p2', type: 'container', x: 250, y: 0, width: 200, height: 200 }),
          n({ id: 'a', parentId: 'p1', x: 100, y: 50, width: 200, height: 50 }),
          n({ id: 'b', parentId: 'p2', x: 50, y: 60, width: 200, height: 50 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    const unrelated = result.overlaps.details.find((o) => o.relation === 'unrelated');
    expect(unrelated).toBeDefined();
  });

  it('classifies overlaps between top-level orphans as siblings', () => {
    // Both have parentId === undefined → undefined === undefined === true,
    // so the engine flags them as siblings (of an implicit root).
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 50, y: 50, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.overlaps.collisions).toBe(1);
    expect(result.overlaps.details[0].relation).toBe('sibling');
  });

  it('detects no overlap when nodes are well-separated', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.overlaps.total).toBe(0);
  });

  it('truncates labels in overlap detail to 20 chars', () => {
    const longA = 'a'.repeat(30);
    const longB = 'b'.repeat(30);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'A', label: longA, x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'B', label: longB, x: 50, y: 50, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    const detail = result.overlaps.details[0];
    expect(detail.nodeA.length).toBe(20);
    expect(detail.nodeB.length).toBe(20);
  });

  it('falls back to id in overlap details when labels are empty', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'idA', label: '', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'idB', label: '', x: 50, y: 50, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    expect(result.overlaps.details[0].nodeA).toBe('idA');
    expect(result.overlaps.details[0].nodeB).toBe('idB');
  });

  it('flags grandparent–grandchild as parent-child via the ancestor walk', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'gp', type: 'container', x: 0, y: 0, width: 500, height: 500 }),
          n({ id: 'p', type: 'container', parentId: 'gp', x: 0, y: 0, width: 300, height: 300 }),
          n({ id: 'c', parentId: 'p', x: 0, y: 0, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true },
    );
    // gp ↔ c sit at depth 2. The isAncestor walk catches it as parent-child.
    expect(result.overlaps.collisions).toBe(0);
  });
});

// ─── inspectLayout — verbose / gaps ─────────────────────────────────────────

describe('inspectLayout — verbose mode', () => {
  it('includes a top-level gaps matrix when verbose=true', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
          n({ id: 'c', x: 0, y: 200, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true, verbose: true },
    );
    expect(result.gaps).toBeDefined();
    // Three pairs from three top-level nodes.
    expect(result.gaps).toHaveLength(3);
    // a↔b are 100 px apart horizontally → gapX=100.
    const ab = result.gaps!.find((g) => g.nodeA === 'a' && g.nodeB === 'b');
    expect(ab!.gapX).toBe(100);
    expect(ab!.relation).toBe('top-level');
  });

  it('omits the gaps matrix when verbose is false (default)', () => {
    const result = inspectLayout({ zoom: 1, lod: 3, nodes: [], edges: [] }, { silent: true });
    expect(result.gaps).toBeUndefined();
  });

  it('truncates labels to 18 chars in the gap matrix', () => {
    const long = 'q'.repeat(30);
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'a', label: long, x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true, verbose: true },
    );
    expect(result.gaps![0].nodeA.length).toBe(18);
  });

  it('falls back to id when label is empty in the gap matrix', () => {
    const result = inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'no-lbl-a', label: '', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { silent: true, verbose: true },
    );
    expect(result.gaps![0].nodeA).toBe('no-lbl-a');
  });
});

// ─── logResult — covered through non-silent inspectLayout ───────────────────

describe('inspectLayout — non-silent path drives logResult', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let groupSpy: ReturnType<typeof vi.spyOn>;
  let groupEndSpy: ReturnType<typeof vi.spyOn>;
  let tableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    groupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    groupSpy.mockRestore();
    groupEndSpy.mockRestore();
    tableSpy.mockRestore();
  });

  it('logs the header / nodes / no-collisions branch for an empty canvas', () => {
    inspectLayout({ zoom: 1, lod: 3, nodes: [], edges: [] });
    // Header + Nodes group + "no collisions" line.
    expect(logSpy).toHaveBeenCalled();
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining(' Nodes'), expect.any(String));
    expect(groupEndSpy).toHaveBeenCalled();
  });

  it('logs container overflow lines with the warning style', () => {
    inspectLayout({
      zoom: 1,
      lod: 3,
      nodes: [
        n({ id: 'p', type: 'container', x: 100, y: 100, width: 100, height: 100 }),
        n({ id: 'c', parentId: 'p', x: 50, y: 50, width: 200, height: 200 }),
      ],
      edges: [],
    });
    const overflowMessages = logSpy.mock.calls.flat().filter(
      (msg: unknown) => typeof msg === 'string' && msg.includes('overflows'),
    );
    expect(overflowMessages.length).toBeGreaterThanOrEqual(4); // 4 sides
  });

  it('logs the collisions section when unrelated overlap exists', () => {
    inspectLayout({
      zoom: 1,
      lod: 3,
      nodes: [
        n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
        n({ id: 'b', x: 50, y: 50, width: 100, height: 100 }),
      ],
      edges: [],
    });
    const collisionLogs = logSpy.mock.calls.flat().filter(
      (msg: unknown) => typeof msg === 'string' && msg.includes('COLLISIONS'),
    );
    expect(collisionLogs.length).toBe(1);
  });

  it('logs the parent-child overlap dim summary when only pc-overlaps exist', () => {
    inspectLayout({
      zoom: 1,
      lod: 3,
      nodes: [
        n({ id: 'p', type: 'container', x: 0, y: 0, width: 200, height: 200 }),
        n({ id: 'c', parentId: 'p', x: 50, y: 50, width: 30, height: 30 }),
      ],
      edges: [],
    });
    const pcLogs = logSpy.mock.calls.flat().filter(
      (msg: unknown) => typeof msg === 'string' && msg.includes('parent-child overlaps'),
    );
    expect(pcLogs.length).toBe(1);
  });

  it('logs the verbose top-level gaps section when verbose=true', () => {
    inspectLayout(
      {
        zoom: 1,
        lod: 3,
        nodes: [
          n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
          n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
        ],
        edges: [],
      },
      { verbose: true },
    );
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining(' Top-level gaps'), expect.any(String));
  });
});

// ─── installInspector / updateInspectorState ────────────────────────────────

describe('installInspector + updateInspectorState', () => {
  // The default vitest env in this monorepo is `node`, so `window` is
  // undefined and installInspector's SSR guard returns early. Tests below
  // provide a synthetic `window` on globalThis to exercise the binding
  // path; one test verifies the SSR guard itself.
  type SyntheticWindow = Record<string, unknown>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns early without throwing when window is undefined (SSR guard)', () => {
    // No window on globalThis (default node env). The guard short-circuits
    // before touching `window.__iceInspect`.
    expect(() => installInspector()).not.toThrow();
  });

  it('binds __iceInspect and __iceInspectVerbose on the synthetic window', () => {
    const win: SyntheticWindow = {};
    (globalThis as { window?: unknown }).window = win;
    installInspector();
    expect(typeof win.__iceInspect).toBe('function');
    expect(typeof win.__iceInspectVerbose).toBe('function');
  });

  it('warns and returns null when called without a cached state', async () => {
    const win: SyntheticWindow = {};
    (globalThis as { window?: unknown }).window = win;
    // Re-import a fresh module instance so `_lastState` starts as null.
    vi.resetModules();
    const fresh = await import('../layout-inspector');
    fresh.installInspector();
    const fn = win.__iceInspect as () => InspectResult | null;
    const result = fn();
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No state available'));
  });

  it('returns the cached inspectLayout result after updateInspectorState', () => {
    const win: SyntheticWindow = {};
    (globalThis as { window?: unknown }).window = win;
    updateInspectorState({ zoom: 0.5, lod: 2, nodes: [], edges: [] });
    installInspector();
    const fn = win.__iceInspect as (opts?: { silent?: boolean }) => InspectResult;
    const result = fn({ silent: true });
    expect(result.zoom).toBe(0.5);
    expect(result.lod).toBe(2);
  });

  it('verbose helper forwards verbose=true to the cached state', () => {
    const win: SyntheticWindow = {};
    (globalThis as { window?: unknown }).window = win;
    updateInspectorState({
      zoom: 1,
      lod: 3,
      nodes: [
        n({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
        n({ id: 'b', x: 200, y: 0, width: 100, height: 100 }),
      ],
      edges: [],
    });
    installInspector();
    const verbose = win.__iceInspectVerbose as () => InspectResult | null;
    const result = verbose();
    expect(result).not.toBeNull();
    expect(result!.gaps).toBeDefined();
  });
});
