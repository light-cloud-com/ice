/**
 * rf-accent-1 — type-shape regression for the dev-accent-picker type leaf.
 *
 * `ThemePalette` and `ColorTheme` were extracted verbatim from
 * `dev-accent-picker.tsx` into `./types.ts`. These tests:
 *
 *   1. Import-resolution smoke: each interface must be importable from
 *      `'../types'`. If a future edit drops one, the file stops compiling.
 *   2. Field-shape regression: assemble dummy values exercising every
 *      field. Renaming or dropping a field surfaces here as a TS error
 *      before consumer files break.
 */

import { describe, expect, it } from 'vitest';

import type { ColorTheme, ThemePalette } from '../types';

describe('dev-accent-picker types — import resolution', () => {
  it('ThemePalette resolves and accepts every documented key', () => {
    const p: ThemePalette = {
      base: '#fff',
      surface: '#eee',
      raised: '#ddd',
      overlay: '#ccc',
      hover: 'rgba(0,0,0,0.05)',
      active: 'rgba(0,0,0,0.10)',
      toolbar: '#bbb',
      border: '#aaa',
      borderStrong: '#999',
      text1: '#000',
      text2: '#222',
      text3: '#444',
      accent: '#3b82f6',
      accentHover: '#2563eb',
      accentMuted: 'rgba(59,130,246,0.12)',
      green: '#16a34a',
      red: '#dc2626',
      yellow: '#b45309',
    };
    expect(Object.keys(p)).toHaveLength(18);
    expect(p.accent).toBe('#3b82f6');
    expect(p.borderStrong).toBe('#999');
  });

  it('ColorTheme resolves with id + name + description + light + dark + preview', () => {
    const t: ColorTheme = {
      id: 'unit-test',
      name: 'Unit Test',
      description: 'Fixture for type tests',
      preview: ['#3b82f6', '#0c1118', '#ffffff'],
      light: {
        base: '#fff',
        surface: '#eee',
        raised: '#ddd',
        overlay: '#ccc',
        hover: 'rgba(0,0,0,0.05)',
        active: 'rgba(0,0,0,0.10)',
        toolbar: '#bbb',
        border: '#aaa',
        borderStrong: '#999',
        text1: '#000',
        text2: '#222',
        text3: '#444',
        accent: '#3b82f6',
        accentHover: '#2563eb',
        accentMuted: 'rgba(59,130,246,0.12)',
        green: '#16a34a',
        red: '#dc2626',
        yellow: '#b45309',
      },
      dark: {
        base: '#0c1118',
        surface: '#151d2a',
        raised: '#1e2838',
        overlay: '#222e40',
        hover: 'rgba(255,255,255,0.06)',
        active: 'rgba(255,255,255,0.09)',
        toolbar: '#111923',
        border: '#1f2c3e',
        borderStrong: '#2e3f55',
        text1: '#e1e7ef',
        text2: '#8b9ab5',
        text3: '#576579',
        accent: '#4c9aff',
        accentHover: '#6bb0ff',
        accentMuted: 'rgba(76,154,255,0.15)',
        green: '#34d399',
        red: '#f87171',
        yellow: '#fbbf24',
      },
    };
    expect(t.id).toBe('unit-test');
    expect(t.preview).toHaveLength(3);
    expect(t.light.accent).toBe('#3b82f6');
    expect(t.dark.accent).toBe('#4c9aff');
  });

  it('preview tuple is exactly three strings', () => {
    const tuple: ColorTheme['preview'] = ['#a', '#b', '#c'];
    expect(tuple).toEqual(['#a', '#b', '#c']);
  });
});
