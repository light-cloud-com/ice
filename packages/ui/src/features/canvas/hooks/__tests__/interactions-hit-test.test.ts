/**
 * rf-canvint-2 — `interactions/hit-test` regression tests.
 *
 * Pure functions, no Provider needed. Each helper has 1–2 zoom-aware
 * branches (resize handle scaled by zoom; canvas-coord conversion
 * divides by zoom). The reverse-iterate-and-break pattern in
 * `findItemAtPosition` is the only non-obvious bit — top-most rendered
 * item wins.
 */

import { describe, it, expect } from 'vitest';

import {
  screenToCanvas,
  isInItem,
  isInResizeHandle,
  findItemAtPosition,
} from '../interactions/hit-test';
import type { CanvasItem, CanvasViewport } from '../interactions/types';

const mkItem = (overrides: Partial<CanvasItem> & { id: string }): CanvasItem => ({
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  parentId: null,
  ...overrides,
});

describe('rf-canvint-2 — screenToCanvas', () => {
  it('returns { x: 0, y: 0 } when rect is null (matches `!svgRef.current` early return)', () => {
    const vp: CanvasViewport = { x: 0, y: 0, zoom: 1 };
    expect(screenToCanvas(123, 456, null, vp)).toEqual({ x: 0, y: 0 });
  });

  it('subtracts rect offset and viewport pan, then divides by zoom', () => {
    const rect = { left: 10, top: 20 };
    const vp: CanvasViewport = { x: 5, y: 7, zoom: 1 };
    // canvas.x = (100 - 10 - 5) / 1 = 85
    // canvas.y = (200 - 20 - 7) / 1 = 173
    expect(screenToCanvas(100, 200, rect, vp)).toEqual({ x: 85, y: 173 });
  });

  it('divides by zoom != 1 (zoom > 1 produces smaller canvas coords)', () => {
    const rect = { left: 0, top: 0 };
    const vp: CanvasViewport = { x: 0, y: 0, zoom: 2 };
    // canvas.x = (100 - 0 - 0) / 2 = 50
    expect(screenToCanvas(100, 100, rect, vp)).toEqual({ x: 50, y: 50 });
  });

  it('handles negative pan correctly', () => {
    const rect = { left: 0, top: 0 };
    const vp: CanvasViewport = { x: -50, y: -100, zoom: 1 };
    // canvas.x = (0 - 0 - (-50)) / 1 = 50
    expect(screenToCanvas(0, 0, rect, vp)).toEqual({ x: 50, y: 100 });
  });
});

describe('rf-canvint-2 — isInItem', () => {
  const item = mkItem({ id: 'a', x: 10, y: 20, width: 100, height: 60 });

  it('returns true for points inside the bounding box', () => {
    expect(isInItem(item, 50, 40)).toBe(true);
  });

  it('returns true on the borders (inclusive)', () => {
    expect(isInItem(item, 10, 20)).toBe(true); // top-left corner
    expect(isInItem(item, 110, 80)).toBe(true); // bottom-right corner
    expect(isInItem(item, 10, 80)).toBe(true);
    expect(isInItem(item, 110, 20)).toBe(true);
  });

  it('returns false outside the bounding box', () => {
    expect(isInItem(item, 9, 40)).toBe(false);
    expect(isInItem(item, 111, 40)).toBe(false);
    expect(isInItem(item, 50, 19)).toBe(false);
    expect(isInItem(item, 50, 81)).toBe(false);
  });
});

describe('rf-canvint-2 — isInResizeHandle', () => {
  const item = mkItem({ id: 'a', x: 0, y: 0, width: 100, height: 60 });

  it('detects points in the bottom-right corner handle at zoom 1', () => {
    // resizeHandleSize=20, zoom=1 → handle is 20px wide
    // handle: x in [80, 100], y in [40, 60]
    expect(isInResizeHandle(item, 90, 50, 20, 1)).toBe(true);
    expect(isInResizeHandle(item, 80, 40, 20, 1)).toBe(true); // top-left of handle (inclusive)
    expect(isInResizeHandle(item, 100, 60, 20, 1)).toBe(true); // bottom-right corner
  });

  it('rejects points outside the handle', () => {
    expect(isInResizeHandle(item, 79, 50, 20, 1)).toBe(false);
    expect(isInResizeHandle(item, 90, 39, 20, 1)).toBe(false);
    expect(isInResizeHandle(item, 101, 50, 20, 1)).toBe(false);
    expect(isInResizeHandle(item, 90, 61, 20, 1)).toBe(false);
  });

  it('scales handle size inversely with zoom (handle stays constant in screen pixels)', () => {
    // zoom=2 → handle is 20/2 = 10 canvas units → handle: x in [90, 100], y in [50, 60]
    expect(isInResizeHandle(item, 95, 55, 20, 2)).toBe(true);
    expect(isInResizeHandle(item, 89, 55, 20, 2)).toBe(false); // outside the smaller handle
    expect(isInResizeHandle(item, 85, 55, 20, 2)).toBe(false);
  });

  it('handle grows in canvas coords when zoom < 1', () => {
    // zoom=0.5 → handle is 20/0.5 = 40 canvas units → handle: x in [60, 100], y in [20, 60]
    expect(isInResizeHandle(item, 70, 40, 20, 0.5)).toBe(true);
    expect(isInResizeHandle(item, 59, 40, 20, 0.5)).toBe(false);
  });
});

describe('rf-canvint-2 — findItemAtPosition', () => {
  const items: CanvasItem[] = [
    mkItem({ id: 'a', x: 0, y: 0, width: 100, height: 60 }),
    mkItem({ id: 'b', x: 50, y: 30, width: 100, height: 60 }), // overlaps a
    mkItem({ id: 'c', x: 200, y: 200, width: 50, height: 30 }),
  ];

  it('returns the LAST item in the list that contains the point (top-most rendered)', () => {
    // Point (60, 40) overlaps both a and b. Reverse-scan picks b.
    const result = findItemAtPosition(items, 60, 40, 20, 1);
    expect(result.item?.id).toBe('b');
    expect(result.isResize).toBe(false);
  });

  it('returns null for points outside all items', () => {
    expect(findItemAtPosition(items, 999, 999, 20, 1)).toEqual({ item: null, isResize: false });
  });

  it('detects resize handle hits (returns isResize: true)', () => {
    // Item c: x=200, y=200, w=50, h=30. Handle at x in [230, 250], y in [210, 230].
    const result = findItemAtPosition(items, 240, 220, 20, 1);
    expect(result.item?.id).toBe('c');
    expect(result.isResize).toBe(true);
  });

  it('resize handle wins over body when point is in handle area', () => {
    // The handle of item c is also inside the body — but the resize check
    // runs first, so isResize is true.
    const result = findItemAtPosition([items[2]], 240, 220, 20, 1);
    expect(result.item?.id).toBe('c');
    expect(result.isResize).toBe(true);
  });

  it('handles empty item array', () => {
    expect(findItemAtPosition([], 10, 10, 20, 1)).toEqual({ item: null, isResize: false });
  });

  it('zoom affects resize handle detection', () => {
    // Item c handle at zoom 0.5 expands to x in [210, 250], y in [190, 230].
    const result = findItemAtPosition([items[2]], 215, 195, 20, 0.5);
    expect(result.item?.id).toBe('c');
    expect(result.isResize).toBe(true);
    // Same point at zoom 2: handle is x in [240, 250], y in [220, 230] — point is OUTSIDE handle
    // but still INSIDE the body (item.x=200, item.y=200, width=50, height=30 → body x in [200,250], y in [200,230])
    const result2 = findItemAtPosition([items[2]], 215, 195, 20, 2);
    // 215 ∈ [200, 250] ✓, 195 ∉ [200, 230] ✗ → outside item entirely
    expect(result2.item).toBeNull();
  });
});
