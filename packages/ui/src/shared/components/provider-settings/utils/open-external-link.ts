/**
 * Provider Settings — `openExternalLink` util.
 *
 * Extracted verbatim from `../../provider-settings.tsx` as part of the
 * rf-pset series. Opens an HTTPS URL in a new browser window with the
 * `noopener,noreferrer` window features so the new context cannot
 * navigate the opener's window — the security baseline for any
 * external-help / docs link.
 *
 * Mirrors the rf-pdpl `openExternalUrl` utility (deploy panel) but is
 * kept local to provider-settings because it always uses
 * `window.open(...)` directly (the deploy panel's variant routes
 * through a desktop-IPC bridge in the Electron build). If a future
 * unit promotes both into a single shared util, the implementations
 * should be reconciled — for now they're separate by deliberate
 * boundary.
 */

export const openExternalLink = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};
