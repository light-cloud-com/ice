/**
 * rf-accent-2 — smoke test for the dev-accent-picker theme data table.
 *
 * `T: ColorTheme[]` is a ~570-LOC pure-data array verbatim-extracted from
 * `dev-accent-picker.tsx`. The test pins:
 *
 *   1. Import resolution: `T` must be importable from `'../data/themes'`.
 *   2. Count regression: 12 themes (default + 11 daisyUI-derived). Adding
 *      or removing a theme should be a deliberate decision flagged here.
 *   3. Shape regression: every entry has the seven top-level keys
 *      (`id`, `name`, `description`, `preview`, `light`, `dark`) and both
 *      palettes contain the 18 documented keys.
 *   4. ID uniqueness: theme IDs are used as the localStorage key
 *      (`ice-theme-id`) and the `T.find((t) => t.id === saved)` lookup —
 *      a duplicate would cause a silent first-match win.
 *   5. Preview tuple shape: exactly three strings — wired through
 *      `theme.preview[0]` (accent chip) and `isDark ? theme.preview[1] :
 *      theme.preview[2]` (surface chip) in the orchestrator render.
 *
 * No per-theme color spot checks — that's testing the design tokens, not
 * the data file's contract.
 */

import { describe, expect, it } from 'vitest';

import { T } from '../data/themes';

const PALETTE_KEYS = [
  'base',
  'surface',
  'raised',
  'overlay',
  'hover',
  'active',
  'toolbar',
  'border',
  'borderStrong',
  'text1',
  'text2',
  'text3',
  'accent',
  'accentHover',
  'accentMuted',
  'green',
  'red',
  'yellow',
] as const;

describe('dev-accent-picker themes data — public surface', () => {
  it('exports T as a non-empty array', () => {
    expect(Array.isArray(T)).toBe(true);
    expect(T.length).toBeGreaterThan(0);
  });

  it('contains exactly 12 themes', () => {
    expect(T).toHaveLength(12);
  });

  it('every theme has unique id', () => {
    const ids = T.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every theme has the seven top-level keys', () => {
    for (const t of T) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('preview');
      expect(t).toHaveProperty('light');
      expect(t).toHaveProperty('dark');
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
    }
  });

  it("every theme's preview is exactly 3 strings", () => {
    for (const t of T) {
      expect(t.preview).toHaveLength(3);
      expect(t.preview.every((p) => typeof p === 'string')).toBe(true);
    }
  });

  it('every theme has both light + dark palettes with all 18 documented keys', () => {
    for (const t of T) {
      for (const k of PALETTE_KEYS) {
        expect(t.light, `theme=${t.id} light.${k}`).toHaveProperty(k);
        expect(t.dark, `theme=${t.id} dark.${k}`).toHaveProperty(k);
        expect(typeof t.light[k]).toBe('string');
        expect(typeof t.dark[k]).toBe('string');
      }
    }
  });

  it('contains the canonical default theme as the first entry', () => {
    expect(T[0].id).toBe('default');
  });

  it('every theme exposes a non-empty accent string in both palettes', () => {
    for (const t of T) {
      expect(t.light.accent.length).toBeGreaterThan(0);
      expect(t.dark.accent.length).toBeGreaterThan(0);
    }
  });
});
