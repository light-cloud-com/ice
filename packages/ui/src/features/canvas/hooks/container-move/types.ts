/**
 * rf-cmove-1 — Shared types for `use-container-move` sub-modules.
 *
 * Internal types lifted out of `use-container-move.ts` so the per-edge
 * expansion + clamp helpers (rf-cmove-1) and the move/toggle-fold runners
 * (rf-cmove-2) can compile independently of the orchestrator hook.
 *
 * Behavior is preserved verbatim from rf-canv-25b — DO NOT consolidate
 * with rf-canv-4's `expandToFitChildren`. See `use-container-move.ts`'s
 * file-level JSDoc for the four ancestor-expansion sites and why they
 * stay separate.
 */

/** A single position update entry (id + new x/y). */
export interface PositionUpdate {
  id: string;
  position: { x: number; y: number };
}

/** A single size update entry (id + new width/height). */
export interface SizeUpdate {
  id: string;
  width: number;
  height: number;
}
