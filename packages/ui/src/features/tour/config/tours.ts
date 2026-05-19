/**
 * tour-12 — Aggregator for in-tree tour definitions.
 *
 * `<TourRunner />` (lands in this same unit) calls `registerTour(t)` for
 * each entry on mount. Order in this array is the order ids show up in
 * `allTours()` — for in-app help menus, deep-link generation, etc.
 *
 * Adding a new tour: write a `<name>-tour.ts` neighbor, `import` it
 * here, and append to the `tours` constant. The runner picks it up on
 * the next dev-server reload — no further wiring required.
 */
import { canvasTour } from './canvas-tour';
import { dashboardTour } from './dashboard-tour';
import type { Tour } from '../tour.types';

// Order is the order ids appear in the Help menu's "Show me around"
// submenu. Dashboard first because it's the user's first surface.
export const tours: readonly Tour[] = [dashboardTour, canvasTour] as const;
