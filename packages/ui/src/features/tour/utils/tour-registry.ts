/**
 * tour-1 — Module-scoped tour registry.
 *
 * Stores tour definitions in a `Map<string, Tour>` private to this
 * module. Two paths populate it (see blueprint §2.4):
 *   1. Static config — `<TourRunner />` calls `registerTour(t)` on mount
 *      for each entry in `config/tours.ts` (lands in tour-12).
 *   2. Dynamic — plugins or feature flags can register/unregister at
 *      runtime via the public barrel.
 *
 * Validation policy (per blueprint §2.4):
 *   - Empty `steps` ALWAYS throws (regardless of `NODE_ENV`).
 *   - Duplicate step ids within a tour ALWAYS throw.
 *   - Duplicate tour id throws in dev (`NODE_ENV !== 'production'`),
 *     warn-and-overwrite in prod.
 *
 * The registry is intentionally private — `getTour` / `allTours` are the
 * only read paths exposed via the barrel. `clearRegistry` is exported
 * for tests but NOT re-exported from `index.ts`.
 */
import type { Tour } from '../tour.types';

// `process` is the Node global; `@types/node` isn't a UI dep, so we
// declare the narrow shape we read. Vite statically replaces
// `process.env.NODE_ENV` at build time, and Vitest exposes the real
// Node `process` at test time — both paths satisfy this signature.
declare const process: { env: { NODE_ENV?: string } };

const tourRegistry = new Map<string, Tour>();

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function validateTour(tour: Tour): void {
  if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
    throw new Error(`[tour] Tour "${tour.id}" has no steps; refusing to register.`);
  }
  const seen = new Set<string>();
  for (const step of tour.steps) {
    if (seen.has(step.id)) {
      throw new Error(
        `[tour] Tour "${tour.id}" has duplicate step id "${step.id}"; step ids must be unique within a tour.`,
      );
    }
    seen.add(step.id);
  }
}

/**
 * Register a tour. Validation runs first (throws synchronously on bad
 * shape) — duplicate-id handling is the only env-conditional branch.
 */
export function registerTour(tour: Tour): void {
  validateTour(tour);
  if (tourRegistry.has(tour.id)) {
    if (!isProd()) {
      throw new Error(
        `[tour] Tour "${tour.id}" is already registered; duplicate registrations are a bug in dev. Call \`unregisterTour\` first or fix the duplicate.`,
      );
    }
    // Production: warn + overwrite. Plugins may legitimately re-register
    // an updated definition, and we'd rather replace than crash a
    // shipped build over a stale registration.

    console.warn(`[tour] Tour "${tour.id}" already registered; overwriting (prod only).`);
  }
  tourRegistry.set(tour.id, tour);
}

export function getTour(id: string): Tour | undefined {
  return tourRegistry.get(id);
}

export function unregisterTour(id: string): void {
  tourRegistry.delete(id);
}

/**
 * Snapshot of every registered tour. Returns a fresh array — mutations
 * to the returned value (push/splice/etc.) do NOT affect the registry.
 * Order is insertion order (Map iteration semantics).
 */
export function allTours(): Tour[] {
  return Array.from(tourRegistry.values());
}

/**
 * @internal Test-only utility. Resets the module-scoped registry to an
 * empty state. NOT exported from the public barrel — import directly
 * from `./tour-registry` in test files.
 */
export function clearRegistry(): void {
  tourRegistry.clear();
}
