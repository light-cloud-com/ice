/**
 * tour-6 — Public consumer hook for the tour engine.
 *
 * Thin selectors + dispatchers over `tour-slice` (blueprint §2.2).
 * The runner (`<TourRunner />`, lands in tour-12) and feature surfaces
 * that want to launch a tour from a button or menu both consume this
 * hook — the slice is intentionally NOT exposed directly.
 *
 * `start`, `advance`, `previous`, `skip`, `stop` follow the lifecycle
 * defined in blueprint §3.5:
 *   - `start(id)` looks up the registered tour to read its
 *     `totalSteps`; an unregistered id is a no-op + dev warn (mirrors
 *     the slice's `startTour` guard).
 *   - `advance()` increments stepIdx; on the terminal step it
 *     dispatches `markCompleted` AND the persistence thunk so the
 *     server is informed of the completion (optimistic — failures log
 *     but don't roll back).
 *   - `previous()` no-ops at index 0.
 *   - `skip()` flags the telemetry as skipped, marks completed, and
 *     persists. Effectively a "I've seen this, don't show me again".
 *   - `stop()` closes without marking completed (Escape key path).
 */
import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../../store';
import { getTour } from '../utils/tour-registry';
import {
  flagSkipped,
  hydrateFromUser,
  markCompleted,
  persistCompletedTour,
  recordAdvance,
  resetTour,
  setPhase,
  setStep,
  startTour,
  stopTour,
} from '../store/tour-slice';

declare const process: { env: { NODE_ENV?: string } };

export interface UseTour {
  /** Currently active tour id, or `null` when no tour is running. */
  activeTourId: string | null;
  /** 0-based step index within the active tour. */
  stepIdx: number;
  /** Total step count of the active tour. `0` when none active. */
  totalSteps: number;
  /** True when stepIdx === 0 (no Back button). */
  isFirst: boolean;
  /** True when stepIdx === totalSteps - 1 (Next becomes Finish). */
  isLast: boolean;
  /** Predicate against `completedTours`. Useful for UI gating. */
  isCompleted: (id: string) => boolean;
  /** Begin a tour. Unregistered id is a no-op + dev warn. */
  start: (tourId: string) => void;
  /** Advance one step; on the last step → markCompleted + persist. */
  advance: () => void;
  /** Step back; no-op at index 0. */
  previous: () => void;
  /** Mark active tour completed (telemetry flagged as skipped). */
  skip: () => void;
  /** Close active tour without marking completed. */
  stop: () => void;
  /** Hydrate completedTours from the server (called by account hydration). */
  hydrate: (completedTours: string[]) => void;
}

export function useTour(): UseTour {
  const dispatch = useDispatch<AppDispatch>();
  const activeTourId = useSelector((s: RootState) => s.tour.activeTourId);
  const stepIdx = useSelector((s: RootState) => s.tour.stepIdx);
  const completedTours = useSelector((s: RootState) => s.tour.completedTours);

  // `totalSteps` is derived from the registry rather than slice state
  // so it stays in lockstep with the live tour definition. The runner
  // re-reads on every selector firing, but the registry is a Map lookup
  // (O(1)) so this is cheap.
  const totalSteps = activeTourId ? getTour(activeTourId)?.steps.length ?? 0 : 0;

  const start = useCallback(
    (tourId: string) => {
      const tour = getTour(tourId);
      if (!tour) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(`[tour] useTour.start("${tourId}") — tour is not registered.`);
        }
        return;
      }
      dispatch(startTour({ tourId, totalSteps: tour.steps.length }));
    },
    [dispatch],
  );

  const advance = useCallback(() => {
    if (!activeTourId) return;
    const total = getTour(activeTourId)?.steps.length ?? 0;
    if (total === 0) return;
    // Telemetry counter increments on every user-driven advance, even
    // the last one (which transitions to completion).
    dispatch(recordAdvance());
    if (stepIdx + 1 >= total) {
      // Terminal step: complete + persist. Order matters — the
      // optimistic slice update must happen before the thunk so a
      // failed network call doesn't leave the user re-watching the
      // tour they just finished.
      const id = activeTourId;
      dispatch(markCompleted(id));
      void dispatch(persistCompletedTour(id));
      return;
    }
    dispatch(setStep(stepIdx + 1));
    dispatch(setPhase('navigating'));
  }, [dispatch, activeTourId, stepIdx]);

  const previous = useCallback(() => {
    if (!activeTourId) return;
    if (stepIdx <= 0) return;
    dispatch(setStep(stepIdx - 1));
    dispatch(setPhase('navigating'));
  }, [dispatch, activeTourId, stepIdx]);

  const skip = useCallback(() => {
    if (!activeTourId) return;
    const id = activeTourId;
    dispatch(flagSkipped(id));
    dispatch(markCompleted(id));
    void dispatch(persistCompletedTour(id));
  }, [dispatch, activeTourId]);

  const stop = useCallback(() => {
    if (!activeTourId) {
      // Still safe to dispatch — the reducer is idempotent on idle —
      // but skipping the dispatch avoids action-log noise.
      return;
    }
    dispatch(stopTour());
  }, [dispatch, activeTourId]);

  const hydrate = useCallback(
    (ids: string[]) => {
      dispatch(hydrateFromUser({ completedTours: ids }));
    },
    [dispatch],
  );

  const isCompleted = useCallback(
    (id: string) => completedTours.includes(id),
    [completedTours],
  );

  return {
    activeTourId,
    stepIdx,
    totalSteps,
    isFirst: stepIdx === 0,
    isLast: totalSteps > 0 && stepIdx === totalSteps - 1,
    isCompleted,
    start,
    advance,
    previous,
    skip,
    stop,
    hydrate,
  };
}

// Re-exported for tests / advanced callers that want the raw action.
// Public consumers should prefer the hook.
export { resetTour };
