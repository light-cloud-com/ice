/**
 * formatDateTime — short "DD MMM HH:MM" formatter for chat conversation timestamps.
 *
 * Locale-aware: uses the runtime's default locale via `undefined` as the first
 * arg to `toLocaleDateString` / `toLocaleTimeString` (matches the in-source
 * behavior of `ai-chat-panel.tsx`). The output shape is stable across locales:
 *   "30 Apr 14:32"   (en-US)
 *   "30 avr 14:32"   (fr-FR)
 *
 * The space-separator between date and time is a literal " " — not the locale's
 * `formatToParts` separator — to match the source verbatim. Do not refactor to
 * `Intl.DateTimeFormat` without preserving this exact join.
 */

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}
