/**
 * tour-13 — URL-driven tour autostart.
 *
 * Watches `?tour=<id>` in the location search. Behavior:
 *   1. Param absent → no-op.
 *   2. Param present, id NOT in registry → dev `console.warn` + strip param.
 *   3. Param present, id IS in registry AND in `completedTours` → silently
 *      strip param (URL hygiene only; don't second-guess the user).
 *   4. Param present, id IS in registry, NOT completed → dispatch
 *      `start(id)` once, then strip the param.
 *
 * The strip rewrites only the `tour` key — other query params and the
 * hash are preserved. `replace: true` so the param doesn't pollute the
 * back stack.
 *
 * StrictMode-safety: a `useRef` records the last-handled `(pathname,
 * tourValue)` pair so the same id doesn't double-dispatch when React's
 * dev double-effect re-runs the hook body. The ref is reset whenever
 * the param vanishes, so re-pasting the same id in a new navigation
 * fires again (which is the right user-facing behavior — a fresh paste
 * = a fresh request).
 *
 * Per blueprint §4.3 + §6/tour-13: this is the v1 auto-fire surface;
 * predicate-based auto-start ("first project after wizard") is v2.
 *
 * The hook is called from inside `<TourRunner />` (single mount point).
 */
import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTour } from './use-tour';
import { selectCompletedTours } from '../store/tour-slice';
import { getTour } from '../utils/tour-registry';

declare const process: { env: { NODE_ENV?: string } };

/**
 * Read `?tour=...` from a search string. Returns the FIRST value (when
 * the param is duplicated, the first wins per common URL semantics).
 * Returns `null` when the param is absent or empty (`?tour=` → null).
 */
function readTourParam(search: string): string | null {
  // `URLSearchParams` is well-supported in jsdom + browsers + Node 18+.
  const params = new URLSearchParams(search);
  const id = params.get('tour');
  if (!id) return null;
  return id;
}

/**
 * Strip every `tour` key from a search string, return the rebuilt query
 * (with leading `?` if non-empty, else ''). Preserves the order of the
 * remaining params.
 */
function stripTourParam(search: string): string {
  const params = new URLSearchParams(search);
  // `delete` removes ALL occurrences of the key, so duplicate `?tour=a&tour=b`
  // is collapsed in one call.
  params.delete('tour');
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function useTourAutostart(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const { start } = useTour();
  const completedTours = useSelector(selectCompletedTours);

  // Track the last (pathname, tourValue) pair we dispatched on. This
  // suppresses StrictMode's double-effect re-fire AND a dependency-array
  // re-run that fires the same effect with the same inputs. We reset
  // the ref the moment the param disappears so a re-paste is treated
  // as a new request.
  const lastHandled = useRef<{ pathname: string; tour: string } | null>(null);

  useEffect(() => {
    const id = readTourParam(location.search);

    // Empty — no-op AND clear last-handled so a re-paste re-fires.
    if (id === null) {
      lastHandled.current = null;
      return;
    }

    // De-dupe: same pathname + same id seen this tick → skip. The
    // location object identity-changes whenever react-router updates
    // anything (pathname, search, hash), so we compare values.
    if (lastHandled.current && lastHandled.current.pathname === location.pathname && lastHandled.current.tour === id) {
      return;
    }
    lastHandled.current = { pathname: location.pathname, tour: id };

    const tour = getTour(id);
    const isRegistered = tour !== undefined;
    const isCompleted = completedTours.includes(id);

    if (!isRegistered && process.env.NODE_ENV !== 'production') {
      console.warn(`[tour] unknown tour id: ${id}`);
    }

    // Only dispatch when the id is registered AND not already completed.
    // Both other branches (unknown id, already-completed) just fall
    // through to the strip below.
    if (isRegistered && !isCompleted) {
      start(id);
    }

    // Strip — preserves other params + hash. `replace: true` keeps the
    // back stack clean.
    const nextSearch = stripTourParam(location.search);
    navigate({ pathname: location.pathname, search: nextSearch, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, completedTours, navigate, start]);
}
