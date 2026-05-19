/**
 * useGhostMode
 *
 * Owns the ghost-mode (AI-Native suggestion) machinery the orchestrator
 * (`svg-canvas.tsx`) used to run inline:
 *
 *   1. The `state.ghosts.ghosts` selector.
 *   2. `handleAcceptGhost(ghost)` — looks up the blueprint for
 *      `ghost.iceType`, expands it at `ghost.position`, dispatches the
 *      expansion onto the active card, wires an edge between the ghost's
 *      source node and the newly-expanded node (direction picked by
 *      `ghost.edgeDirection`), then dismisses the ghost. If the
 *      blueprint lookup fails, only the dismiss runs.
 *   3. `handleDismissGhost(ghostId)` — fire-and-forget dismiss.
 *   4. The 10s auto-dismiss `useEffect` — when at least one ghost
 *      exists, schedules a `clearGhosts()` dispatch
 *      `Math.max(0, 10_000 - elapsed)` ms after the **newest** ghost's
 *      `createdAt` timestamp. The clamp via `Math.max` ensures already-
 *      stale ghosts (elapsed > 10_000) clear immediately rather than
 *      scheduling a negative-delay timer. Cleanup clears the timer on
 *      unmount or when the `ghosts` array reference changes.
 *
 * Behavior is preserved verbatim from the pre-rf-canv-23 inline form,
 * including:
 *   - The 10_000 ms threshold (do NOT change).
 *   - The `Math.max(0, ...)` elapsed clamp.
 *   - The `ghost.edgeDirection === 'to'` branch's source/target ordering.
 *   - The `edge-${Date.now()}` edge-id format used by `addEdgeToCard`.
 *
 * `setGhosts` is intentionally NOT moved into this hook — the
 * orchestrator's blueprint-drop / new-block handlers still dispatch
 * `setGhosts(generateGhostSuggestions(...))` directly. Only the
 * accept/dismiss/auto-dismiss surface lives here.
 *
 * rf-canv-23.
 */

import { useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { addEdgeToCard, expandBlueprintToCard } from '../../../store/slices/cards-slice';
import { dismissGhost, clearGhosts, type GhostNode } from '../../../store/slices/ghost-slice';
import type { RootState, AppDispatch } from '../../../store';

export interface UseGhostModeResult {
  /** All currently-pinned ghost suggestions (from `state.ghosts.ghosts`). */
  ghosts: GhostNode[];
  /**
   * Accept a ghost: expand its blueprint at the ghost's position, wire
   * an edge to/from the source node, and dismiss the ghost. If the
   * blueprint can't be resolved, only the dismiss runs.
   */
  handleAcceptGhost: (ghost: GhostNode) => void;
  /** Dismiss a ghost by id without expansion. */
  handleDismissGhost: (ghostId: string) => void;
}

export function useGhostMode(): UseGhostModeResult {
  const dispatch = useDispatch<AppDispatch>();
  const ghosts = useSelector((state: RootState) => state.ghosts.ghosts);

  // ── Ghost-mode handlers ────────────────────────────────────────────────────
  // Accept: expand blueprint at ghost position, wire edge to source node,
  // remove ghost. Dismiss: just remove ghost.
  const handleAcceptGhost = useCallback(
    (ghost: GhostNode) => {
      const blueprint = getBlueprint(ghost.iceType);
      if (!blueprint) {
        dispatch(dismissGhost(ghost.id));
        return;
      }
      const expanded = expandBlueprint(blueprint, { position: ghost.position });
      dispatch(expandBlueprintToCard(expanded));

      const [source, target] =
        ghost.edgeDirection === 'to' ? [ghost.sourceNodeId, expanded.node.id] : [expanded.node.id, ghost.sourceNodeId];

      dispatch(
        addEdgeToCard({
          id: `edge-${Date.now()}`,
          source,
          target,
          data: { relationship: ghost.edgeRelationship },
        }),
      );
      dispatch(dismissGhost(ghost.id));
    },
    [dispatch],
  );

  const handleDismissGhost = useCallback(
    (ghostId: string) => {
      dispatch(dismissGhost(ghostId));
    },
    [dispatch],
  );

  // Auto-dismiss all ghosts after 10 seconds.
  useEffect(() => {
    if (ghosts.length === 0) return;
    const newest = Math.max(...ghosts.map((g) => g.createdAt));
    const elapsed = Date.now() - newest;
    const remaining = Math.max(0, 10_000 - elapsed);
    const timer = setTimeout(() => dispatch(clearGhosts()), remaining);
    return () => clearTimeout(timer);
  }, [ghosts, dispatch]);

  return { ghosts, handleAcceptGhost, handleDismissGhost };
}
