/**
 * Dev Accent Picker — palette apply / clear helpers.
 *
 * Extracted verbatim from `../../dev-accent-picker.tsx` as part of the
 * rf-accent series. These helpers mutate `document.documentElement.style`
 * directly — preserving them as standalone functions (rather than inlining
 * into the orchestrator) keeps the DOM-side-effect surface in one named
 * place and makes the orchestrator's render-vs-effect separation easier
 * to reason about. The `ALL_PROPS` constant is exported alongside so a
 * future `applyPalette` test can pin it against the keys it sets.
 *
 *   `applyPalette(p)` — set every `--ice-*` property from a `ThemePalette`.
 *   `clearOverrides()` — remove every `--ice-*` property and drop the
 *      saved theme id from `localStorage`. Used by the Reset button.
 *   `ALL_PROPS` — the canonical list of CSS custom properties the dev
 *      tool owns. Adding a key here MUST be paired with adding the
 *      corresponding `s.setProperty(...)` line in `applyPalette`.
 */

import type { ThemePalette } from '../types';

export function applyPalette(p: ThemePalette): void {
  const s = document.documentElement.style;
  s.setProperty('--ice-bg-base', p.base);
  s.setProperty('--ice-bg-surface', p.surface);
  s.setProperty('--ice-bg-raised', p.raised);
  s.setProperty('--ice-bg-overlay', p.overlay);
  s.setProperty('--ice-bg-hover', p.hover);
  s.setProperty('--ice-bg-active', p.active);
  s.setProperty('--ice-bg-toolbar', p.toolbar);
  s.setProperty('--ice-border', p.border);
  s.setProperty('--ice-border-subtle', p.text3 + '30');
  s.setProperty('--ice-border-strong', p.borderStrong);
  s.setProperty('--ice-text-primary', p.text1);
  s.setProperty('--ice-text-secondary', p.text2);
  s.setProperty('--ice-text-tertiary', p.text3);
  s.setProperty('--ice-accent', p.accent);
  s.setProperty('--ice-accent-hover', p.accentHover);
  s.setProperty('--ice-accent-muted', p.accentMuted);
  s.setProperty('--ice-green', p.green);
  s.setProperty('--ice-red', p.red);
  s.setProperty('--ice-yellow', p.yellow);
}

export const ALL_PROPS = [
  '--ice-bg-base',
  '--ice-bg-surface',
  '--ice-bg-raised',
  '--ice-bg-overlay',
  '--ice-bg-hover',
  '--ice-bg-active',
  '--ice-bg-toolbar',
  '--ice-border',
  '--ice-border-subtle',
  '--ice-border-strong',
  '--ice-text-primary',
  '--ice-text-secondary',
  '--ice-text-tertiary',
  '--ice-accent',
  '--ice-accent-hover',
  '--ice-accent-muted',
  '--ice-green',
  '--ice-red',
  '--ice-yellow',
];

export function clearOverrides(): void {
  const s = document.documentElement.style;
  for (const p of ALL_PROPS) s.removeProperty(p);
  localStorage.removeItem('ice-theme-id');
}
