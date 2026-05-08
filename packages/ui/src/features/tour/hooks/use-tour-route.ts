/**
 * tour-11 — Router-aware navigation gate for the running tour.
 *
 * Steps may declare `route: '/...'` to mean "drive the user there
 * before resolving the target". This hook is the gate — it does NOT
 * auto-fire navigation (the runner sequences onEnter side-effects
 * around the call), it just exposes:
 *
 *   - `phase`: 'arrived' when target is undefined OR the pathname
 *     startsWith targetRoute; 'navigating' otherwise.
 *   - `navigateTo()`: imperative trigger that calls
 *     `useNavigate()(targetRoute)`. No-op when already there.
 *
 * Pathname comparison uses `startsWith` so `/settings` matches
 * `/settings/account` (per §2.3 of the blueprint). Full spec in
 * blueprint §3.6 + §6/tour-11.
 */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type RoutePhase = 'idle' | 'navigating' | 'arrived';

export interface UseTourRouteOptions {
  /** Path the tour wants the user on. `undefined` → no navigation. */
  targetRoute: string | undefined;
}

export interface UseTourRouteReturn {
  /**
   * `'arrived'` once the gate is open; `'navigating'` while we're
   * still off-route. `'idle'` is reserved for the runner's state
   * machine and is not produced by v1.
   */
  phase: RoutePhase;
  /** Imperative trigger. No-op on undefined / already-arrived. */
  navigateTo: () => void;
}

function pathMatches(pathname: string, target: string): boolean {
  return pathname === target || pathname.startsWith(target);
}

export function useTourRoute(opts: UseTourRouteOptions): UseTourRouteReturn {
  const { targetRoute } = opts;
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  // React's render is the subscription — when react-router-dom updates
  // `useLocation()` after a navigation, this hook re-runs.
  let phase: RoutePhase;
  if (targetRoute === undefined) {
    phase = 'arrived';
  } else if (pathMatches(pathname, targetRoute)) {
    phase = 'arrived';
  } else {
    phase = 'navigating';
  }

  const navigateTo = useCallback(() => {
    if (targetRoute === undefined) return;
    if (pathMatches(pathname, targetRoute)) return;
    navigate(targetRoute);
  }, [navigate, targetRoute, pathname]);

  return { phase, navigateTo };
}
