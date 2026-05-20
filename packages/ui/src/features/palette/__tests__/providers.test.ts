/**
 * rf-rpal-4 — `data/providers.ts` invariant tests.
 *
 * Pin the four module exports:
 *   - `getProviders(t)` — builds the provider filter dropdown options.
 *     Order is observable ('all' first, then cloud providers in
 *     ENABLED_PROVIDERS declaration order). The 'all' label resolves
 *     through the passed-in translator at call time (locale-reactive).
 *   - STORAGE_KEY — load-bearing localStorage key 'ice-palette-collapsed'.
 *     User-observable in DevTools, do NOT change without migration.
 *   - loadCollapsed / saveCollapsed — error-swallowing localStorage R/W
 *     wrappers. Tests cover the happy path, malformed JSON, missing key,
 *     and localStorage-throws scenarios.
 *   - PALETTE_STYLES — CSS keyframes string. Pin the keyframe names so a
 *     future "tidy up" doesn't break running animations on consumers.
 *
 * Identity `t` is passed for deterministic label assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config/providers', () => ({
  ENABLED_PROVIDERS: [
    { id: 'aws', shortName: 'AWS', color: '#FF9900' },
    { id: 'gcp', shortName: 'GCP', color: '#4285F4' },
    { id: 'azure', shortName: 'Azure', color: '#0078D4' },
  ],
  ENABLED_PROVIDER_IDS: new Set(['aws', 'gcp', 'azure']),
}));

import { getProviders, STORAGE_KEY, PALETTE_STYLES, loadCollapsed, saveCollapsed } from '../data/providers';

const t = (k: string) => k;
const PROVIDERS = getProviders(t);

describe('getProviders', () => {
  it("starts with the 'all' option whose label resolves through the passed-in translator", () => {
    expect(PROVIDERS[0].id).toBe('all');
    expect(PROVIDERS[0].label).toBe('palette.providerAll');
    expect(PROVIDERS[0].color).toBeUndefined();
  });

  it('appends every entry from ENABLED_PROVIDERS in declaration order', () => {
    expect(PROVIDERS.slice(1).map((p) => p.id)).toEqual(['aws', 'gcp', 'azure']);
  });

  it('every cloud provider entry carries id/label/color', () => {
    for (const p of PROVIDERS.slice(1)) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.color).toBe('string');
    }
  });

  it('uses each enabled provider shortName as the dropdown label', () => {
    const aws = PROVIDERS.find((p) => p.id === 'aws');
    const gcp = PROVIDERS.find((p) => p.id === 'gcp');
    const azure = PROVIDERS.find((p) => p.id === 'azure');
    expect(aws?.label).toBe('AWS');
    expect(gcp?.label).toBe('GCP');
    expect(azure?.label).toBe('Azure');
  });

  it('forwards each enabled provider color verbatim', () => {
    const aws = PROVIDERS.find((p) => p.id === 'aws');
    const gcp = PROVIDERS.find((p) => p.id === 'gcp');
    const azure = PROVIDERS.find((p) => p.id === 'azure');
    expect(aws?.color).toBe('#FF9900');
    expect(gcp?.color).toBe('#4285F4');
    expect(azure?.color).toBe('#0078D4');
  });

  it('has length 4 (1 all + 3 enabled cloud providers)', () => {
    expect(PROVIDERS).toHaveLength(4);
  });

  it('uses the latest translator each call (locale-reactive)', () => {
    const en = getProviders(() => 'All');
    const zh = getProviders(() => '全部');
    expect(en[0].label).toBe('All');
    expect(zh[0].label).toBe('全部');
  });
});

describe('STORAGE_KEY', () => {
  it('is the literal string "ice-palette-collapsed" — observable in localStorage', () => {
    // Critical: changing this key would orphan all users' saved collapse state
    // on the next deploy. Pin verbatim.
    expect(STORAGE_KEY).toBe('ice-palette-collapsed');
  });
});

describe('loadCollapsed / saveCollapsed', () => {
  let store: Record<string, string>;
  let getItem: (k: string) => string | null;
  let setItem: (k: string, v: string) => void;

  beforeEach(() => {
    store = {};
    getItem = vi.fn((k: string) => (k in store ? store[k] : null));
    setItem = vi.fn((k: string, v: string) => {
      store[k] = v;
    });
    vi.stubGlobal('localStorage', { getItem, setItem });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadCollapsed returns an empty Set when no key is stored', () => {
    expect(loadCollapsed()).toEqual(new Set());
  });

  it('saveCollapsed writes JSON-stringified array under STORAGE_KEY', () => {
    saveCollapsed(new Set(['Compute', 'Network']));
    expect(store[STORAGE_KEY]).toBe(JSON.stringify(['Compute', 'Network']));
  });

  it('saveCollapsed → loadCollapsed round-trips the set', () => {
    saveCollapsed(new Set(['Database', 'Storage']));
    expect(loadCollapsed()).toEqual(new Set(['Database', 'Storage']));
  });

  it('loadCollapsed returns an empty Set when the stored value is malformed JSON', () => {
    store[STORAGE_KEY] = 'not json {';
    expect(loadCollapsed()).toEqual(new Set());
  });

  it('loadCollapsed swallows getItem errors and returns an empty Set', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: vi.fn(),
    });
    expect(loadCollapsed()).toEqual(new Set());
  });

  it('saveCollapsed swallows setItem errors silently', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => saveCollapsed(new Set(['x']))).not.toThrow();
  });

  it('saveCollapsed handles an empty Set by writing []', () => {
    saveCollapsed(new Set());
    expect(store[STORAGE_KEY]).toBe('[]');
  });

  it('loadCollapsed accepts a stored empty array as an empty Set', () => {
    store[STORAGE_KEY] = '[]';
    expect(loadCollapsed()).toEqual(new Set());
  });
});

describe('PALETTE_STYLES', () => {
  it('declares the three documented keyframe names', () => {
    expect(PALETTE_STYLES).toContain('@keyframes palette-item-in');
    expect(PALETTE_STYLES).toContain('@keyframes palette-fade-in');
    expect(PALETTE_STYLES).toContain('@keyframes palette-pulse-glow');
  });

  it('declares the .palette-item-enter and .palette-fade-enter classes', () => {
    expect(PALETTE_STYLES).toContain('.palette-item-enter');
    expect(PALETTE_STYLES).toContain('.palette-fade-enter');
  });

  it('binds .palette-item-enter to the palette-item-in 0.25s animation', () => {
    expect(PALETTE_STYLES).toContain('animation: palette-item-in 0.25s ease-out both');
  });

  it('binds .palette-fade-enter to the palette-fade-in 0.2s animation', () => {
    expect(PALETTE_STYLES).toContain('animation: palette-fade-in 0.2s ease-out both');
  });

  it('palette-item-in slides 6px from translateX(-6px) to translateX(0)', () => {
    expect(PALETTE_STYLES).toContain('translateX(-6px)');
    expect(PALETTE_STYLES).toContain('translateX(0)');
  });

  it('is non-empty', () => {
    expect(PALETTE_STYLES.length).toBeGreaterThan(0);
  });
});
