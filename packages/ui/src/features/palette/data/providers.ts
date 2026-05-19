/**
 * Resource Palette — provider filter list, collapsed-section persistence,
 * and CSS keyframes.
 *
 * Extracted verbatim from `components/resource-palette.tsx` (rf-rpal-4).
 *
 * `getProviders(t)` returns the list of options for the section header's
 * provider dropdown. The 'all' entry resolves its label through the
 * passed-in `t` translator at call time; cloud providers come from the
 * enabled list (`aws`, `gcp`, `azure`).
 *
 * **Locale-reactivity:** the previous module-level `PROVIDERS` constant
 * called `translate('palette.providerAll')` at import time, freezing the
 * "All" label to whichever locale was active on first import. Now the
 * getter is called from inside the React component each render so
 * locale changes re-derive the label.
 *
 * `STORAGE_KEY` is the localStorage key under which the user's
 * collapsed-section preference is persisted. UX-observable: do NOT change
 * the key without also writing a migration. `loadCollapsed` and
 * `saveCollapsed` swallow JSON / DOM errors silently — the palette must
 * still render in environments without localStorage (Safari private mode,
 * test stubs).
 *
 * `PALETTE_STYLES` is the CSS keyframes string injected once by the
 * orchestrator. The animations drive item-stagger and fade-in transitions.
 */

import { ENABLED_PROVIDERS as ENABLED_CLOUD_PROVIDERS } from '../../../config/providers';

type Translator = (key: string) => string;

export interface ProviderOption {
  id: string;
  label: string;
  color?: string;
}

/** Provider filter options shown in the BlocksSection header dropdown.
 *  Call from inside a React component (with `t` from `useTranslation()`)
 *  so the "All" label re-derives when the user switches locale. */
export function getProviders(t: Translator): ProviderOption[] {
  return [
    { id: 'all', label: t('palette.providerAll') },
    ...ENABLED_CLOUD_PROVIDERS.map((p) => ({ id: p.id, label: p.shortName, color: p.color })),
  ];
}

/** localStorage key for the user's collapsed-section preference.
 *  Observable in DevTools → Application → Local Storage. */
export const STORAGE_KEY = 'ice-palette-collapsed';

/** Read the collapsed-categories set from localStorage. Returns an empty
 *  set on any failure (no key, malformed JSON, localStorage unavailable). */
export function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return new Set();
}

/** Persist the collapsed-categories set to localStorage. Errors swallowed
 *  so the palette stays interactive even if storage is unavailable. */
export function saveCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* ignore */
  }
}

/** CSS keyframes for the palette's item-stagger and fade-in animations. */
export const PALETTE_STYLES = `
  @keyframes palette-item-in {
    from { opacity: 0; transform: translateX(-6px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes palette-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes palette-pulse-glow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  .palette-item-enter {
    animation: palette-item-in 0.25s ease-out both;
  }
  .palette-fade-enter {
    animation: palette-fade-in 0.2s ease-out both;
  }
`;
