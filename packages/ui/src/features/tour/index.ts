/**
 * Tour engine barrel.
 *
 * Public surface only. Internal hooks (target resolver, element
 * position, focus-trap util) are NOT exported here — feature-internal
 * code imports them by relative path. `clearRegistry` is intentionally
 * NOT re-exported — it's a test util, importable from
 * `./utils/tour-registry` directly.
 *
 * Surface tier:
 *   - Types: every public shape from `tour.types.ts`.
 *   - Registry: `registerTour` / `unregisterTour` / `getTour` / `allTours`.
 *   - Hook: `useTour` (the primary consumer API; see blueprint §2.2).
 *   - Slice: `tourReducer` for root-store registration; action creators
 *     and selectors for advanced consumers (the hook is preferred).
 */

export type { Tour, TourStep, Placement, TourStepActions, TourLifecycleCtx, AutoStartCtx } from './tour.types';
export { registerTour, unregisterTour, getTour, allTours } from './utils/tour-registry';

// Hook — the primary consumer API.
export { useTour } from './hooks/use-tour';
export type { UseTour } from './hooks/use-tour';

// Slice — exported for root-store registration and advanced consumers
// (e.g. extraReducers in adjacent slices that listen for tour actions).
export {
  default as tourReducer,
  startTour,
  setStep,
  setPhase,
  markCompleted,
  stopTour,
  flagSkipped,
  hydrateFromUser,
  recordAdvance,
  resetTour,
  persistCompletedTour,
  COMPLETED_TOURS_STORAGE_KEY,
  selectActiveTourId,
  selectStepIdx,
  selectPhase,
  selectCompletedTours,
  selectIsCompleted,
  selectHydrated,
} from './store/tour-slice';
export type { TourState, TourPhase, TourPerTourTelemetry, TourSliceRoot } from './store/tour-slice';
