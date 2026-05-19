/**
 * tour-3 — Pure rect helpers.
 *
 * Coverage: every numeric branch of `expandRect` and `clampRectToViewport`.
 * No React, no DOM stubs — both helpers are total functions over a
 * `RectLike` input. The lookalike's `toJSON` is exercised separately so
 * tests downstream that serialise the rect (e.g. into Redux) don't
 * silently lose fields.
 */
import { describe, expect, it } from 'vitest';
import { clampRectToViewport, expandRect, type RectLike } from '../target-rect';

const makeInput = (overrides: Partial<RectLike> = {}): RectLike => {
  const x = overrides.x ?? 10;
  const y = overrides.y ?? 20;
  const width = overrides.width ?? 100;
  const height = overrides.height ?? 50;
  return {
    x,
    y,
    width,
    height,
    top: overrides.top ?? y,
    right: overrides.right ?? x + width,
    bottom: overrides.bottom ?? y + height,
    left: overrides.left ?? x,
  };
};

describe('expandRect', () => {
  it('adds the pad on every side and grows width/height by 2*pad', () => {
    const out = expandRect(makeInput({ x: 100, y: 200, width: 50, height: 40 }), 10);
    expect(out).toMatchObject({
      x: 90,
      y: 190,
      width: 70,
      height: 60,
      top: 190,
      right: 160,
      bottom: 250,
      left: 90,
    });
  });

  it('returns a snapshot with zero pad — no mutation of the input', () => {
    const input = makeInput({ x: 1, y: 2, width: 3, height: 4 });
    const out = expandRect(input, 0);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
    expect(out).not.toBe(input);
  });

  it('shrinks rect inward when pad is negative', () => {
    const out = expandRect(makeInput({ x: 0, y: 0, width: 100, height: 80 }), -5);
    expect(out).toMatchObject({
      x: 5,
      y: 5,
      width: 90,
      height: 70,
      top: 5,
      right: 95,
      bottom: 75,
      left: 5,
    });
  });

  it('clamps width/height to zero when negative pad exceeds half the dimension', () => {
    // 50px-wide rect, pad -100 → naive width = 50 + (-200) = -150; clamped to 0.
    const out = expandRect(makeInput({ x: 100, y: 100, width: 50, height: 40 }), -100);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    // x and y still shift outward by -pad — the math is uniform; only
    // width/height get the non-negativity clamp. The right/bottom
    // collapse onto left/top once width/height are zeroed.
    expect(out.x).toBe(200);
    expect(out.y).toBe(200);
    expect(out.right).toBe(out.left);
    expect(out.bottom).toBe(out.top);
  });

  it('toJSON returns a plain object with the eight DOMRect fields', () => {
    const out = expandRect(makeInput(), 4);
    const json = out.toJSON();
    expect(Object.keys(json).sort()).toEqual(['bottom', 'height', 'left', 'right', 'top', 'width', 'x', 'y'].sort());
    expect(typeof (json as unknown as { toJSON?: () => unknown }).toJSON).toBe('undefined');
  });

  it('preserves DOMRect-like equivalences: x === left, y === top, x+width === right, y+height === bottom', () => {
    const out = expandRect(makeInput({ x: 5, y: 7, width: 11, height: 13 }), 3);
    expect(out.x).toBe(out.left);
    expect(out.y).toBe(out.top);
    expect(out.right).toBe(out.x + out.width);
    expect(out.bottom).toBe(out.y + out.height);
  });
});

describe('clampRectToViewport', () => {
  it('returns the input unchanged when fully inside the viewport', () => {
    const out = clampRectToViewport(makeInput({ x: 100, y: 50, width: 200, height: 80 }), { width: 1024, height: 768 });
    expect(out).toMatchObject({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      top: 50,
      right: 300,
      bottom: 130,
      left: 100,
    });
  });

  it('clips negative origins to zero and reduces the corresponding extent', () => {
    // x = -50, width = 200 → right = 150 (still inside viewport). After
    // clip, left = 0, width = 150.
    const out = clampRectToViewport(makeInput({ x: -50, y: -30, width: 200, height: 100 }), {
      width: 1024,
      height: 768,
    });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(150);
    expect(out.height).toBe(70);
    expect(out.right).toBe(150);
    expect(out.bottom).toBe(70);
  });

  it('clamps width/height that overflow the viewport on the far edge', () => {
    const out = clampRectToViewport(makeInput({ x: 800, y: 600, width: 500, height: 400 }), {
      width: 1024,
      height: 768,
    });
    // Right would be 1300, clamped to viewport 1024 → width = 224.
    expect(out.x).toBe(800);
    expect(out.width).toBe(224);
    expect(out.right).toBe(1024);
    // Bottom would be 1000, clamped to 768 → height = 168.
    expect(out.y).toBe(600);
    expect(out.height).toBe(168);
    expect(out.bottom).toBe(768);
  });

  it('clamps both negative origin AND oversize extent simultaneously', () => {
    const out = clampRectToViewport(makeInput({ x: -100, y: -100, width: 2000, height: 2000 }), {
      width: 1024,
      height: 768,
    });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(1024);
    expect(out.height).toBe(768);
  });

  it('collapses to zero-area at the right/bottom edge when fully past the viewport', () => {
    const out = clampRectToViewport(makeInput({ x: 2000, y: 2000, width: 100, height: 100 }), {
      width: 1024,
      height: 768,
    });
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
    // The clamp lands the rect against the viewport edge.
    expect(out.x).toBe(1024);
    expect(out.y).toBe(768);
  });

  it('collapses to zero-area at the left/top edge when fully past the negative side', () => {
    const out = clampRectToViewport(makeInput({ x: -500, y: -300, width: 100, height: 100 }), {
      width: 1024,
      height: 768,
    });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('handles a zero-area rect at the origin (no-op)', () => {
    const out = clampRectToViewport(makeInput({ x: 0, y: 0, width: 0, height: 0 }), { width: 1024, height: 768 });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('handles a viewport of zero size — every rect collapses to (0,0,0,0)', () => {
    const out = clampRectToViewport(makeInput({ x: 50, y: 50, width: 100, height: 100 }), { width: 0, height: 0 });
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('toJSON returns a plain object with the eight DOMRect fields', () => {
    const out = clampRectToViewport(makeInput(), { width: 100, height: 100 });
    const json = out.toJSON();
    expect(Object.keys(json).sort()).toEqual(['bottom', 'height', 'left', 'right', 'top', 'width', 'x', 'y'].sort());
  });

  it('does not mutate the input rect', () => {
    const input = makeInput({ x: -200, y: -200, width: 500, height: 500 });
    const before = { ...input };
    clampRectToViewport(input, { width: 100, height: 100 });
    expect(input).toEqual(before);
  });
});
