/**
 * rf-accent-3 — `applyPalette` / `clearOverrides` / `ALL_PROPS` utilities.
 *
 * Pins the verbatim DOM-mutation contract the dev tool relies on: every
 * `--ice-*` CSS custom property is set on `document.documentElement.style`
 * from a `ThemePalette`. The test stubs `document` and `localStorage` so
 * the calls land on spies (the vitest config defaults to the `node`
 * environment, see rf-pdpl-12 stub-globals learning, repeated by
 * rf-pset-3).
 *
 * Coverage scope:
 *
 *   1. `applyPalette` sets all 19 properties (18 from the palette + 1
 *      derived `--ice-border-subtle` = `text3 + '30'`).
 *   2. `applyPalette` writes the verbatim values from the palette.
 *   3. `applyPalette` derives `--ice-border-subtle` as `text3 + '30'`
 *      (the alpha-channel hex suffix is verbatim from the source).
 *   4. `ALL_PROPS` matches the keys `applyPalette` sets — pinned as a
 *      single sorted array equality check.
 *   5. `clearOverrides` removes every key in `ALL_PROPS` and drops
 *      `ice-theme-id` from localStorage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyPalette, clearOverrides, ALL_PROPS } from '../utils/apply-palette';
import type { ThemePalette } from '../types';

const SAMPLE: ThemePalette = {
  base: '#ffffff',
  surface: '#f0f1f4',
  raised: '#ffffff',
  overlay: '#ffffff',
  hover: 'rgba(0,0,0,0.04)',
  active: 'rgba(0,0,0,0.08)',
  toolbar: '#e4e6eb',
  border: '#d5d8de',
  borderStrong: '#b8bcc5',
  text1: '#11181c',
  text2: '#3d4551',
  text3: '#636c76',
  accent: '#2563eb',
  accentHover: '#1d4ed8',
  accentMuted: 'rgba(37,99,235,0.12)',
  green: '#16a34a',
  red: '#dc2626',
  yellow: '#b45309',
};

describe('applyPalette', () => {
  let setProperty: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setProperty = vi.fn();
    vi.stubGlobal('document', {
      documentElement: {
        style: { setProperty },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets all 19 documented CSS custom properties', () => {
    applyPalette(SAMPLE);
    expect(setProperty).toHaveBeenCalledTimes(19);
  });

  it('passes verbatim values for each non-derived property', () => {
    applyPalette(SAMPLE);
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-base', '#ffffff');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-surface', '#f0f1f4');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-raised', '#ffffff');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-overlay', '#ffffff');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-hover', 'rgba(0,0,0,0.04)');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-active', 'rgba(0,0,0,0.08)');
    expect(setProperty).toHaveBeenCalledWith('--ice-bg-toolbar', '#e4e6eb');
    expect(setProperty).toHaveBeenCalledWith('--ice-border', '#d5d8de');
    expect(setProperty).toHaveBeenCalledWith('--ice-border-strong', '#b8bcc5');
    expect(setProperty).toHaveBeenCalledWith('--ice-text-primary', '#11181c');
    expect(setProperty).toHaveBeenCalledWith('--ice-text-secondary', '#3d4551');
    expect(setProperty).toHaveBeenCalledWith('--ice-text-tertiary', '#636c76');
    expect(setProperty).toHaveBeenCalledWith('--ice-accent', '#2563eb');
    expect(setProperty).toHaveBeenCalledWith('--ice-accent-hover', '#1d4ed8');
    expect(setProperty).toHaveBeenCalledWith('--ice-accent-muted', 'rgba(37,99,235,0.12)');
    expect(setProperty).toHaveBeenCalledWith('--ice-green', '#16a34a');
    expect(setProperty).toHaveBeenCalledWith('--ice-red', '#dc2626');
    expect(setProperty).toHaveBeenCalledWith('--ice-yellow', '#b45309');
  });

  it('derives --ice-border-subtle as text3 + "30" (alpha-hex suffix verbatim)', () => {
    applyPalette(SAMPLE);
    expect(setProperty).toHaveBeenCalledWith('--ice-border-subtle', '#636c7630');
  });

  it('returns void / undefined', () => {
    expect(applyPalette(SAMPLE)).toBeUndefined();
  });
});

describe('ALL_PROPS', () => {
  it('matches the 19 properties applyPalette sets', () => {
    const setProperty = vi.fn();
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty } },
    });
    applyPalette(SAMPLE);
    const propsActuallySet = setProperty.mock.calls.map((c) => c[0] as string).sort();
    const propsAdvertised = [...ALL_PROPS].sort();
    expect(propsActuallySet).toEqual(propsAdvertised);
    vi.unstubAllGlobals();
  });

  it('lists exactly 19 keys', () => {
    expect(ALL_PROPS).toHaveLength(19);
  });

  it('contains every documented --ice-* family root', () => {
    expect(ALL_PROPS).toContain('--ice-bg-base');
    expect(ALL_PROPS).toContain('--ice-border-subtle');
    expect(ALL_PROPS).toContain('--ice-text-primary');
    expect(ALL_PROPS).toContain('--ice-accent');
    expect(ALL_PROPS).toContain('--ice-yellow');
  });
});

describe('clearOverrides', () => {
  let removeProperty: ReturnType<typeof vi.fn>;
  let removeItem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    removeProperty = vi.fn();
    removeItem = vi.fn();
    vi.stubGlobal('document', {
      documentElement: {
        style: { removeProperty },
      },
    });
    vi.stubGlobal('localStorage', { removeItem });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes every property in ALL_PROPS', () => {
    clearOverrides();
    expect(removeProperty).toHaveBeenCalledTimes(ALL_PROPS.length);
    for (const p of ALL_PROPS) {
      expect(removeProperty).toHaveBeenCalledWith(p);
    }
  });

  it('drops the ice-theme-id key from localStorage', () => {
    clearOverrides();
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith('ice-theme-id');
  });

  it('returns void / undefined', () => {
    expect(clearOverrides()).toBeUndefined();
  });
});
