import { describe, expect, it } from 'vitest';
import { getMagneticAttach, slideAlong, getAnchorPoint, DEFAULT_PERIMETER_MARGIN } from '../magnetic-attach';
import type { Bounds, Point, Side } from '../types';

const block: Bounds = { x: 100, y: 100, width: 200, height: 100 };

function center(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

describe('getMagneticAttach', () => {
  it('keeps the attach on the preferred side when target is in that half-plane', () => {
    // Target to the right of block; preferred = right.
    const target: Point = { x: 600, y: 150 };
    const { attach, side } = getMagneticAttach(block, 'right', target);
    expect(side).toBe('right');
    expect(attach.x).toBe(block.x + block.width); // right edge
  });

  it('migrates to the opposite side when target is in the opposite half-plane', () => {
    // Target to the FAR left of block; preferred = right (e.g. socket
    // is anchored right, but the partner sits to the left).
    const target: Point = { x: -200, y: 150 };
    const { side } = getMagneticAttach(block, 'right', target);
    expect(side).toBe('left');
  });

  it('respects the preferred side when geometry only weakly disagrees (above instead of right)', () => {
    // Target above block; preferred = right. We keep right (no flip to opposite half-plane).
    const target: Point = { x: 200, y: -200 };
    const { side } = getMagneticAttach(block, 'right', target);
    expect(side).toBe('right');
  });

  it('slides the attach along the side toward the target projection', () => {
    // Target far down-right; on the right side, y should slide down toward target.y.
    const target: Point = { x: 600, y: 600 };
    const { attach } = getMagneticAttach(block, 'right', target);
    expect(attach.y).toBe(block.y + block.height - DEFAULT_PERIMETER_MARGIN);
  });

  it('clamps to corner margin so the attach never reaches the literal corner', () => {
    // Target far away vertically beyond the block's bottom.
    const target: Point = { x: 1000, y: 9999 };
    const { attach } = getMagneticAttach(block, 'right', target, 20);
    expect(attach.y).toBe(block.y + block.height - 20);
  });

  it('tie-break: dx === dy uses vertical branch (strict > matches chooseSides)', () => {
    // Target at +200 dx, +200 dy from center → equal magnitudes; vertical wins.
    const c = center(block);
    const target: Point = { x: c.x + 200, y: c.y + 200 };
    // Preferred = right → opposite = left. Facing axis with strict > falls to vertical → bottom.
    // 'bottom' !== opposite[right]==='left', so preferredSide wins → 'right'.
    // We assert via slideAlong + getMagneticAttach side resolution explicitly:
    const { side } = getMagneticAttach(block, 'right', target);
    expect(side).toBe('right');
  });
});

describe('slideAlong', () => {
  it.each<[Side, (b: Bounds, t: Point) => Point]>([
    ['left', (b) => ({ x: b.x, y: 0 })],
    ['right', (b) => ({ x: b.x + b.width, y: 0 })],
    ['top', (b) => ({ x: 0, y: b.y })],
    ['bottom', (b) => ({ x: 0, y: b.y + b.height })],
  ])('places attach on the named side: %s', (side, makeExpected) => {
    const target: Point = { x: 150, y: 150 };
    const p = slideAlong(block, side, target);
    if (side === 'left' || side === 'right') {
      expect(p.x).toBe(makeExpected(block, target).x);
    } else {
      expect(p.y).toBe(makeExpected(block, target).y);
    }
  });
});

describe('getAnchorPoint', () => {
  it('returns the side midpoint for the idle drag-start dot', () => {
    expect(getAnchorPoint(block, 'left')).toEqual({ x: 100, y: 150 });
    expect(getAnchorPoint(block, 'right')).toEqual({ x: 300, y: 150 });
    expect(getAnchorPoint(block, 'top')).toEqual({ x: 200, y: 100 });
    expect(getAnchorPoint(block, 'bottom')).toEqual({ x: 200, y: 200 });
  });
});
