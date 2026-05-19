/**
 * Dev Accent Picker — shared context + consumer hook.
 *
 * Extracted verbatim from `../dev-accent-picker.tsx` as part of the
 * rf-accent series. The picker exposes a `toggle()` callback to its
 * descendant tree via React context so the app bar can open the panel
 * without prop-drilling through every layout layer.
 *
 *   `ThemePickerContext` — the context object. Internal to this folder
 *      plus the orchestrator (which mounts the `<Provider value={{ toggle }}>`).
 *   `useThemePicker()` — the consumer hook. Re-exported from the public
 *      shim (`../dev-accent-picker.tsx`) for backwards compat with
 *      existing import sites in `packages/web/src/pages/app-settings.tsx`.
 */

import { createContext, useContext } from 'react';

export const ThemePickerContext = createContext<{ toggle: () => void }>({
  toggle: () => {},
});

export const useThemePicker = (): { toggle: () => void } => useContext(ThemePickerContext);
