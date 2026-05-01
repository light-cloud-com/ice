/**
 * rf-canvint-1: Initial-state singleton + grid-snap helper for the
 * canvas-interactions hook group.
 *
 * `INITIAL_STATE` is consumed at hook mount AND on every reset of
 * `stateRef.current` after a gesture completes (`handleMouseUp`,
 * cancellation). The reset MUST allocate a fresh `dragItemOffsets` Map —
 * sharing the singleton's Map across resets would silently leak state
 * across gestures. The exported `freshInitialState()` helper centralizes
 * the spread + new-Map idiom so both the orchestrator and any sub-hook
 * can use the same shape.
 *
 * `KEYBOARD_PAN_SPEED` and `snapToGrid` were inline in the original; both
 * are pure constants/functions with no React dependency, so they live
 * here too.
 */

import type { InteractionState } from './types.js';

export const INITIAL_STATE: InteractionState = {
  mode: 'none',
  itemId: null,
  startX: 0,
  startY: 0,
  startItemX: 0,
  startItemY: 0,
  startItemWidth: 0,
  startItemHeight: 0,
  boxStartCanvasX: 0,
  boxStartCanvasY: 0,
  dragItemOffsets: new Map(),
};

/**
 * Build a fresh `InteractionState` snapshot — same shape as `INITIAL_STATE`
 * but with a NEW `dragItemOffsets` Map so resets don't share Map identity
 * across gestures.
 */
export function freshInitialState(): InteractionState {
  return { ...INITIAL_STATE, dragItemOffsets: new Map() };
}

export const KEYBOARD_PAN_SPEED = 15;

/** Snap a value to the nearest grid increment. */
export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}
