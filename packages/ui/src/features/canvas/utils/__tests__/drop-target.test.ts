/**
 * rf-canv-6 — pure hit-test regression for the drop-target util.
 *
 * The two helpers lifted out of `svg-canvas.tsx` (`findContainerAtPosition`,
 * `findSmallestContainerHit`) implement drop-target hit-testing for the
 * canvas — figuring out which container the user is pointing at so the
 * orchestrator can highlight it, reparent into it, or route a drop event.
 *
 * Each test below pins one slice of the verbatim semantics so the
 * orchestrator's thin wrappers can keep delegating to these utils without
 * subtly drifting:
 *
 * - inclusive-edge bounding-box test (a point ON the right/bottom edge counts);
 * - z-index DESC sort uses the real `calculateZIndex` table (VPC < Subnet <
 *   Group.* < container < other), so the "topmost in paint order" wins;
 * - smallest-area tiebreaker for nested containers;
 * - excludeIds support skips dragged-node + descendant + current-parent;
 * - both helpers are predicate-generic — the predicate decides what counts
 *   as a container at this callsite.
 *
 * No React, no Redux — synthetic CanvasNode arrays only.
 */

import { describe, it, expect } from 'vitest';

import type { CanvasNode } from '../../components/types';
import { findContainerAtPosition, findSmallestContainerHit } from '../drop-target';

/** Minimal CanvasNode factory — only the fields these utils read. */
function node(overrides: Partial<CanvasNode> & Pick<CanvasNode, 'id'>): CanvasNode {
  return {
    type: 'container',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    label: overrides.id,
    data: {},
    parentId: null,
    ...overrides,
  };
}

const anyContainer = (): true => true;
const noContainer = (): false => false;

// Predicate matching the orchestrator's L1635 inline drop rule:
// `isContainer(iceType) || iceType.startsWith('Group.') || iceType.startsWith('Network.')`.
// We don't import the real `isContainer`; we hand-build iceTypes that exercise
// each of the three OR branches.
function dropTargetPredicate(n: CanvasNode): boolean {
  const iceType = (n.data.iceType as string) || '';
  return iceType.startsWith('Group.') || iceType.startsWith('Network.');
}

describe('findContainerAtPosition', () => {
  it('returns null when the node list is empty', () => {
    expect(findContainerAtPosition([], 0, 0, anyContainer)).toBeNull();
  });

  it('returns null when no node passes the predicate', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findContainerAtPosition(nodes, 50, 50, noContainer)).toBeNull();
  });

  it('returns null when point is outside every container', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100, data: { iceType: 'Group.A' } })];
    expect(findContainerAtPosition(nodes, 200, 200, dropTargetPredicate)).toBeNull();
  });

  it('returns the single container hit', () => {
    const nodes = [node({ id: 'a', x: 10, y: 10, width: 100, height: 100, data: { iceType: 'Group.A' } })];
    expect(findContainerAtPosition(nodes, 50, 50, dropTargetPredicate)?.id).toBe('a');
  });

  it('inclusive on the left/top edge', () => {
    const nodes = [node({ id: 'a', x: 10, y: 20, width: 100, height: 100, data: { iceType: 'Group.A' } })];
    expect(findContainerAtPosition(nodes, 10, 20, dropTargetPredicate)?.id).toBe('a');
  });

  it('inclusive on the right/bottom edge', () => {
    const nodes = [node({ id: 'a', x: 10, y: 20, width: 100, height: 100, data: { iceType: 'Group.A' } })];
    expect(findContainerAtPosition(nodes, 110, 120, dropTargetPredicate)?.id).toBe('a');
  });

  it('returns the highest z-index container when overlapping', () => {
    // VPC (z=0), Subnet (z=10), Group.* (z=15), other / container (z=100 by
    // default through the predicate, but predicates only lets through Group./Network.)
    // Use Subnet vs VPC — Subnet wins (higher z-index).
    const nodes = [
      node({ id: 'vpc', x: 0, y: 0, width: 200, height: 200, data: { iceType: 'Network.VPC' } }),
      node({ id: 'subnet', x: 50, y: 50, width: 100, height: 100, data: { iceType: 'Network.Subnet' } }),
    ];
    // Point hits both; Subnet has higher z-index (10 vs 0).
    expect(findContainerAtPosition(nodes, 100, 100, dropTargetPredicate)?.id).toBe('subnet');
  });

  it('Group.* (z=15) beats Network.Subnet (z=10) by z-index', () => {
    const nodes = [
      node({ id: 'subnet', x: 0, y: 0, width: 200, height: 200, data: { iceType: 'Network.Subnet' } }),
      node({ id: 'group', x: 50, y: 50, width: 100, height: 100, data: { iceType: 'Group.Auth' } }),
    ];
    expect(findContainerAtPosition(nodes, 100, 100, dropTargetPredicate)?.id).toBe('group');
  });

  it('predicate filters out non-container types — Network.VPC matches the iceType.startsWith(Network.) branch', () => {
    const nodes = [
      // Plain iceType — predicate rejects; not a hit.
      node({ id: 'svc', x: 0, y: 0, width: 200, height: 200, data: { iceType: 'Compute.Service' } }),
      // Network.VPC — predicate accepts via the iceType.startsWith('Network.') branch.
      node({ id: 'vpc', x: 50, y: 50, width: 100, height: 100, data: { iceType: 'Network.VPC' } }),
    ];
    const got = findContainerAtPosition(nodes, 100, 100, dropTargetPredicate);
    expect(got?.id).toBe('vpc');
  });

  it('Group.* prefix branch is exercised by the predicate', () => {
    const nodes = [node({ id: 'g', x: 0, y: 0, width: 100, height: 100, data: { iceType: 'Group.Backend' } })];
    expect(findContainerAtPosition(nodes, 50, 50, dropTargetPredicate)?.id).toBe('g');
  });

  it('Network. prefix branch is exercised by the predicate', () => {
    const nodes = [
      node({ id: 'pub', x: 0, y: 0, width: 100, height: 100, data: { iceType: 'Network.PublicEndpoint' } }),
    ];
    expect(findContainerAtPosition(nodes, 50, 50, dropTargetPredicate)?.id).toBe('pub');
  });

  it('iceType missing (undefined data) defaults to empty string and is rejected by predicate', () => {
    const nodes = [node({ id: 'x', x: 0, y: 0, width: 100, height: 100 })];
    expect(findContainerAtPosition(nodes, 50, 50, dropTargetPredicate)).toBeNull();
  });

  it('sort comparator handles missing iceType (falls back to empty string)', () => {
    // Both nodes pass the trivial predicate; one has no iceType (`|| ''`
    // branch). Empty iceType maps to z-index 100 (the "other" bucket), same as
    // any non-VPC/Subnet/Group/container node — so order between two empty
    // iceTypes is array-stable, and the first overlapping hit wins.
    const nodes = [
      node({ id: 'a', x: 0, y: 0, width: 100, height: 100 }),
      node({ id: 'b', x: 0, y: 0, width: 100, height: 100 }),
    ];
    const got = findContainerAtPosition(nodes, 50, 50, anyContainer);
    expect(got).not.toBeNull();
    expect(['a', 'b']).toContain(got?.id);
  });

  it('nested overlap — z-index decides over containment, not smallest-area', () => {
    // Two containers, both contain the point. Outer is Group.* (z=15), inner
    // is Network.VPC (z=0). The primary helper picks the higher z-index =
    // OUTER, even though the inner is geometrically smaller. (That's
    // intentional and is what differentiates this helper from
    // findSmallestContainerHit.)
    const nodes = [
      node({ id: 'outer', x: 0, y: 0, width: 200, height: 200, data: { iceType: 'Group.Outer' } }),
      node({ id: 'inner', x: 50, y: 50, width: 100, height: 100, data: { iceType: 'Network.VPC' } }),
    ];
    expect(findContainerAtPosition(nodes, 100, 100, dropTargetPredicate)?.id).toBe('outer');
  });
});

describe('findSmallestContainerHit', () => {
  it('returns null when the node list is empty', () => {
    expect(findSmallestContainerHit([], 0, 0, anyContainer)).toBeNull();
  });

  it('returns null when no node passes the predicate', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 50, 50, noContainer)).toBeNull();
  });

  it('returns null when point is outside every container', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 200, 200, anyContainer)).toBeNull();
  });

  it('returns the single hit', () => {
    const nodes = [node({ id: 'a', x: 10, y: 10, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 50, 50, anyContainer)?.id).toBe('a');
  });

  it('skips a later candidate whose area is not strictly smaller', () => {
    // Two overlapping containers, same area. The first one encountered wins
    // because the comparison is strictly `<` (not `<=`).
    const nodes = [
      node({ id: 'first', x: 0, y: 0, width: 100, height: 100 }),
      node({ id: 'second', x: 0, y: 0, width: 100, height: 100 }),
    ];
    expect(findSmallestContainerHit(nodes, 50, 50, anyContainer)?.id).toBe('first');
  });

  it('picks the smallest-area container when multiple overlap', () => {
    const nodes = [
      node({ id: 'big', x: 0, y: 0, width: 300, height: 300 }),
      node({ id: 'medium', x: 50, y: 50, width: 200, height: 200 }),
      node({ id: 'small', x: 80, y: 80, width: 50, height: 50 }),
    ];
    expect(findSmallestContainerHit(nodes, 100, 100, anyContainer)?.id).toBe('small');
  });

  it('inclusive on the right/bottom edge', () => {
    const nodes = [node({ id: 'a', x: 10, y: 20, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 110, 120, anyContainer)?.id).toBe('a');
  });

  it('skips nodes whose id is in excludeIds', () => {
    const nodes = [
      node({ id: 'small', x: 0, y: 0, width: 50, height: 50 }),
      node({ id: 'big', x: 0, y: 0, width: 200, height: 200 }),
    ];
    // Without excludes, 'small' would win. Excluding 'small' leaves 'big'.
    expect(findSmallestContainerHit(nodes, 25, 25, anyContainer, new Set(['small']))?.id).toBe('big');
  });

  it('returns null when every candidate is excluded', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 50, 50, anyContainer, new Set(['a']))).toBeNull();
  });

  it('predicate is applied AFTER excludeIds — excluded nodes are not predicate-tested', () => {
    // Predicate that throws if invoked — proves excludeIds short-circuits before predicate.
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    const trickyPredicate = (n: CanvasNode): boolean => {
      if (n.id === 'a') throw new Error('predicate should not see excluded node');
      return false;
    };
    expect(findSmallestContainerHit(nodes, 50, 50, trickyPredicate, new Set(['a']))).toBeNull();
  });

  it('predicate filters non-containers — only matching nodes are considered for smallest-area', () => {
    // 'small' is geometrically smaller, but predicate rejects it; 'big' wins.
    const nodes = [
      node({ id: 'small', type: 'block', x: 0, y: 0, width: 50, height: 50 }),
      node({ id: 'big', type: 'container', x: 0, y: 0, width: 200, height: 200 }),
    ];
    const onlyContainers = (n: CanvasNode): boolean => n.type === 'container';
    expect(findSmallestContainerHit(nodes, 25, 25, onlyContainers)?.id).toBe('big');
  });

  it('point exactly at a corner counts as inside (inclusive-edge)', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 0, 0, anyContainer)?.id).toBe('a');
    expect(findSmallestContainerHit(nodes, 100, 100, anyContainer)?.id).toBe('a');
  });

  it('point one pixel outside the right edge does not match (exclusive past edge)', () => {
    const nodes = [node({ id: 'a', x: 0, y: 0, width: 100, height: 100 })];
    expect(findSmallestContainerHit(nodes, 101, 50, anyContainer)).toBeNull();
  });

  it('mirrors the orchestrator pattern — exclude dragged + descendants + current-parent', () => {
    // Reproduce the real Shift-drag exclusion shape: dragged node, its
    // descendants, multi-drag selection, and the current parent are all
    // skipped. The smallest remaining container at the drop point wins.
    const nodes: CanvasNode[] = [
      node({ id: 'parent', type: 'container', x: 0, y: 0, width: 400, height: 400 }),
      node({ id: 'drag', type: 'block', x: 50, y: 50, width: 50, height: 50, parentId: 'parent' }),
      node({ id: 'descendant', type: 'block', x: 60, y: 60, width: 20, height: 20, parentId: 'drag' }),
      node({ id: 'multi', type: 'block', x: 70, y: 70, width: 20, height: 20 }),
      node({ id: 'newTarget', type: 'container', x: 100, y: 100, width: 200, height: 200 }),
    ];
    const excludes = new Set(['drag', 'descendant', 'multi', 'parent']);
    const got = findSmallestContainerHit(nodes, 150, 150, (n) => n.type === 'container', excludes);
    expect(got?.id).toBe('newTarget');
  });
});
