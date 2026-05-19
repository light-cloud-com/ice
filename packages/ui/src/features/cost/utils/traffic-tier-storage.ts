/**
 * Traffic-tier persistence utilities.
 *
 * Lifted from `cost-panel.tsx` (rf-cost-1). The cost panel exposes a "traffic
 * tier" slider — the user's choice is persisted to localStorage so it survives
 * panel toggles and page reloads.
 *
 * The storage layer is wrapped in try/catch on both reads and writes:
 * localStorage can throw in private-browsing modes or when quota is exhausted,
 * and the panel must keep functioning even when persistence fails. On any
 * error reading we fall back to the default tier index (2 = "Moderate"); on
 * any error writing we silently swallow it.
 *
 * Reads also clamp the parsed integer to `[0, TRAFFIC_TIERS.length - 1]` so a
 * stale value from a previous schema (e.g. a tier that was removed) cannot
 * out-of-range the slider.
 */
import { TRAFFIC_TIERS } from './provider-pricing';

export const TRAFFIC_TIER_KEY = 'ice-cost-traffic-tier';

/** Default tier index when no value is persisted or parsing fails. */
export const DEFAULT_TRAFFIC_TIER_INDEX = 2;

/** Read the persisted tier index, falling back to the default on any error. */
export function loadTrafficTier(): number {
  try {
    const v = localStorage.getItem(TRAFFIC_TIER_KEY);
    if (!v) return DEFAULT_TRAFFIC_TIER_INDEX;
    const parsed = parseInt(v, 10);
    return Math.max(0, Math.min(TRAFFIC_TIERS.length - 1, parsed));
  } catch {
    return DEFAULT_TRAFFIC_TIER_INDEX;
  }
}

/** Persist the tier index. Errors (quota, private-browsing) are swallowed. */
export function saveTrafficTier(value: number) {
  try {
    localStorage.setItem(TRAFFIC_TIER_KEY, String(value));
  } catch {
    /* ignore */
  }
}
