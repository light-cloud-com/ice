/**
 * Handle opening a URL in the user's default browser.
 * Tries IPC bridge first, falls back to window.open().
 */
export function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
