/**
 * tour-1 — Tour engine barrel.
 *
 * Public surface only. Hooks, components, and Redux slice land in
 * later units (tour-3 → tour-12) and will be added here as they ship.
 * `clearRegistry` is intentionally NOT re-exported — it's a test util,
 * importable from `./utils/tour-registry` directly.
 */

export type { Tour, TourStep, Placement, TourStepActions, TourLifecycleCtx, AutoStartCtx } from './tour.types';
export { registerTour, unregisterTour, getTour, allTours } from './utils/tour-registry';
