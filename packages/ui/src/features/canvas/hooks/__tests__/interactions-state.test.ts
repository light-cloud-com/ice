/**
 * rf-canvint-1 — `interactions/state` and `interactions/types` regression tests.
 *
 * Pins the verbatim shape of `INITIAL_STATE`, `freshInitialState`,
 * `KEYBOARD_PAN_SPEED`, and `snapToGrid` extracted from
 * `use-canvas-interactions.ts`. The behaviour-preserving move is the
 * only correctness claim — these are pure constants/functions, no
 * React surface, no provider needed.
 */

import { describe, it, expect } from 'vitest';
import { INITIAL_STATE, KEYBOARD_PAN_SPEED, cursorForMode, freshInitialState, snapToGrid } from '../interactions/state';
import type { InteractionState, InteractionMode, DragItemOffset } from '../interactions/types';

describe('rf-canvint-1 — INITIAL_STATE', () => {
  it('starts in mode "none" with all numerics at 0 and a Map for dragItemOffsets', () => {
    expect(INITIAL_STATE.mode).toBe<InteractionMode>('none');
    expect(INITIAL_STATE.itemId).toBeNull();
    expect(INITIAL_STATE.startX).toBe(0);
    expect(INITIAL_STATE.startY).toBe(0);
    expect(INITIAL_STATE.startItemX).toBe(0);
    expect(INITIAL_STATE.startItemY).toBe(0);
    expect(INITIAL_STATE.startItemWidth).toBe(0);
    expect(INITIAL_STATE.startItemHeight).toBe(0);
    expect(INITIAL_STATE.boxStartCanvasX).toBe(0);
    expect(INITIAL_STATE.boxStartCanvasY).toBe(0);
    expect(INITIAL_STATE.dragItemOffsets).toBeInstanceOf(Map);
  });
});

describe('rf-canvint-1 — freshInitialState', () => {
  it('returns a state shape equivalent to INITIAL_STATE', () => {
    const fresh = freshInitialState();
    expect(fresh.mode).toBe('none');
    expect(fresh.itemId).toBeNull();
    expect(fresh.startX).toBe(0);
    expect(fresh.startY).toBe(0);
    expect(fresh.startItemX).toBe(0);
    expect(fresh.startItemY).toBe(0);
    expect(fresh.startItemWidth).toBe(0);
    expect(fresh.startItemHeight).toBe(0);
    expect(fresh.boxStartCanvasX).toBe(0);
    expect(fresh.boxStartCanvasY).toBe(0);
  });

  it('returns a NEW Map each call (Map identity must not be shared across resets)', () => {
    const a = freshInitialState();
    const b = freshInitialState();
    expect(a.dragItemOffsets).not.toBe(b.dragItemOffsets);
    // Mutating one must not affect the other
    a.dragItemOffsets.set('x', { dx: 1, dy: 2, startX: 0, startY: 0 } satisfies DragItemOffset);
    expect(b.dragItemOffsets.size).toBe(0);
  });

  it('does not share its Map with INITIAL_STATE.dragItemOffsets either', () => {
    const fresh = freshInitialState();
    expect(fresh.dragItemOffsets).not.toBe(INITIAL_STATE.dragItemOffsets);
  });

  it('returns a new top-level state object each call', () => {
    const a = freshInitialState();
    const b = freshInitialState();
    expect(a).not.toBe(b);
  });
});

describe('rf-canvint-1 — KEYBOARD_PAN_SPEED', () => {
  it('is 15px per frame (verbatim from inline original)', () => {
    expect(KEYBOARD_PAN_SPEED).toBe(15);
  });
});

describe('rf-canvint-1 — snapToGrid', () => {
  it('snaps to the nearest grid increment', () => {
    expect(snapToGrid(0, 20)).toBe(0);
    expect(snapToGrid(10, 20)).toBe(20); // round half-up: Math.round(0.5) = 1, * 20 = 20
    expect(snapToGrid(9, 20)).toBe(0);
    expect(snapToGrid(11, 20)).toBe(20);
    expect(snapToGrid(20, 20)).toBe(20);
    expect(snapToGrid(35, 20)).toBe(40);
  });

  it('handles negative values', () => {
    expect(snapToGrid(-10, 20)).toBe(-0); // Math.round(-0.5) = 0 in JS, but -0 === 0
    expect(snapToGrid(-11, 20)).toBe(-20);
    expect(snapToGrid(-9, 20)).toBe(-0);
    expect(snapToGrid(-20, 20)).toBe(-20);
  });

  it('handles non-square grid sizes', () => {
    expect(snapToGrid(50, 25)).toBe(50);
    expect(snapToGrid(60, 25)).toBe(50); // 60/25 = 2.4 → 2 → 50
    expect(snapToGrid(63, 25)).toBe(75); // 63/25 = 2.52 → 3 → 75
  });

  it('passes-through fractional inputs that hit exact midpoints', () => {
    // Math.round uses banker's rounding in some engines but V8/Node uses
    // half-away-from-zero; pin behaviour for integers.
    expect(snapToGrid(15, 10)).toBe(20);
    expect(snapToGrid(25, 10)).toBe(30); // half-away-from-zero
  });
});

describe('rf-canvint-5 — cursorForMode', () => {
  it('returns "grabbing" for pan', () => {
    expect(cursorForMode('pan')).toBe('grabbing');
  });

  it('returns "move" for drag', () => {
    expect(cursorForMode('drag')).toBe('move');
  });

  it('returns "se-resize" for resize', () => {
    expect(cursorForMode('resize')).toBe('se-resize');
  });

  it('returns "crosshair" for boxSelect', () => {
    expect(cursorForMode('boxSelect')).toBe('crosshair');
  });

  it('returns "default" for none', () => {
    expect(cursorForMode('none')).toBe('default');
  });
});

describe('rf-canvint-1 — InteractionState type shape (compile-time guard)', () => {
  it('accepts a fully-populated state literal (typecheck guard)', () => {
    const state: InteractionState = {
      mode: 'drag',
      itemId: 'item-1',
      startX: 100,
      startY: 200,
      startItemX: 10,
      startItemY: 20,
      startItemWidth: 50,
      startItemHeight: 30,
      boxStartCanvasX: 0,
      boxStartCanvasY: 0,
      dragItemOffsets: new Map<string, DragItemOffset>([['other-1', { dx: 5, dy: 5, startX: 100, startY: 100 }]]),
    };
    expect(state.mode).toBe('drag');
    expect(state.dragItemOffsets.size).toBe(1);
  });
});
