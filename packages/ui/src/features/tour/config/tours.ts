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
import { paletteTour } from './palette-tour';
import type { Tour } from '../tour.types';

export const tours: readonly Tour[] = [canvasTour, paletteTour] as const;
