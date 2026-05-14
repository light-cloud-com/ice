/**
 * Predicate-based autostart — the v2 path the blueprint reserved for
 * post-v1 tours.
 *
 * Iterates every registered tour each render, picks the first one whose
 * `autoStart(ctx)` returns true AND whose first step's anchor is in the
 * DOM, and dispatches `start(id)`. Mounted in `<TourRunner />`.
 *
 * Three gates:
 *   1. Already-completed tours are skipped (`completedTours` set).
 *   2. Already-fired-this-session tours are skipped (module set —
 *      survives Escape-dismissal so a stopped tour doesn't re-fire on
 *      every effect run, but resets on a full reload).
 *   3. Another tour is already active → no-op until it ends.
 *
 * Re-evaluation triggers: pathname change (router), DOM mutation
 * (anchor mounting late), completedTours change (just-finished tour),
 * activeTourId change (tour ended). MutationObserver runs only while
 * the autostart is "armed but waiting" — disconnects as soon as one
 * tour fires.
 *
 * Tours without `autoStart` are silently skipped — they're launched
 * via the URL param hook, the Help menu, or the OnboardingChecklist.
 */
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';

import type { RootState } from '../../../store';
import { selectActiveTourId, selectCompletedTours } from '../store/tour-slice';
import type { AutoStartCtx, Tour } from '../tour.types';
import { allTours } from '../utils/tour-registry';
import { useTour } from './use-tour';

/**
 * Per-session "already auto-fired" guard. Module-scoped so it survives
 * StrictMode double-mount; cleared only on full reload (or via the
 * test-only escape hatch below).
 */
const sessionFired = new Set<string>();

function firstStepAnchorPresent(tour: Tour): boolean {
  if (typeof document === 'undefined') return false;
  const target = tour.steps[0]?.target;
  if (!target) return false;
  if (typeof target === 'function') return target() != null;
  return document.querySelector(target) != null;
}

export function useTourPredicateAutostart(): void {
  const { start } = useTour();
  const activeTourId = useSelector(selectActiveTourId);
  const completedTours = useSelector(selectCompletedTours);
  // Defensive: tests may register only the tour slice. `account?.user`
  // collapses to null in those cases without crashing.
  const user = useSelector((s: RootState) => s.account?.user ?? null);
  const location = useLocation();

  useEffect(() => {
    if (activeTourId) return;

    const ctx: AutoStartCtx = {
      user,
      completedTours,
      pathname: location.pathname,
    };

    const tryFire = (): boolean => {
      const registered = allTours();
      const reasons: Array<Record<string, unknown>> = [];
      for (const tour of registered) {
        const hasAutoStart = !!tour.autoStart;
        const alreadyFired = sessionFired.has(tour.id);
        const completed = completedTours.includes(tour.id);
        const predicateOk = hasAutoStart ? tour.autoStart!(ctx) : false;
        const anchorOk = predicateOk && firstStepAnchorPresent(tour);
        reasons.push({
          id: tour.id,
          hasAutoStart,
          alreadyFired,
          completed,
          predicateOk,
          anchorOk,
        });
        if (!hasAutoStart) continue;
        if (alreadyFired) continue;
        if (completed) continue;
        if (!predicateOk) continue;
        if (!anchorOk) continue;
        // eslint-disable-next-line no-console
        console.info('[tour-autostart] firing', tour.id, ctx);
        sessionFired.add(tour.id);
        start(tour.id);
        return true;
      }
      // eslint-disable-next-line no-console
      console.debug('[tour-autostart] no match', { ctx, reasons });
      return false;
    };

    if (tryFire()) return;
    if (typeof document === 'undefined' || !document.body) return;

    // eslint-disable-next-line no-console
    console.debug('[tour-autostart] observing DOM for anchor mounts');
    const observer = new MutationObserver(() => {
      if (tryFire()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeTourId, completedTours, user, location.pathname, start]);
}

/** @internal Test-only — clear the per-session "already fired" set. */
export function __clearTourPredicateAutostartFired(): void {
  sessionFired.clear();
}
