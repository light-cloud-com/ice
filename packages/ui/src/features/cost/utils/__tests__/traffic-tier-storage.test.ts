/**
 * rf-cost-1 — traffic-tier-storage.
 *
 * Pin the localStorage wrapper behavior:
 *   - default fallback when no value is stored
 *   - clamp out-of-range values
 *   - swallow read/write errors
 *   - accept NaN-parse fallthrough via Math.min(NaN, x) → NaN, then Math.max(0, NaN) → NaN
 *     (the function does not validate parseInt result; tests document actual behavior)
 *
 * The suite uses a small mock for `localStorage` so we can simulate throws
 * without depending on jsdom's storage implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TRAFFIC_TIER_KEY,
  DEFAULT_TRAFFIC_TIER_INDEX,
  loadTrafficTier,
  saveTrafficTier,
} from '../traffic-tier-storage';
import { TRAFFIC_TIERS } from '../provider-pricing';

// ─── Storage harness ──────────────────────────────────────────────────────

interface StorageStub {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
}

let originalLocalStorage: Storage | undefined;
let store: Map<string, string>;

function installStub(stub: Partial<StorageStub>) {
  store = new Map();
  const full: StorageStub = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    ...stub,
  };
  originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: full,
    configurable: true,
  });
}

function restoreStorage() {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

beforeEach(() => {
  installStub({});
});

afterEach(() => {
  restoreStorage();
  vi.restoreAllMocks();
});

// ─── Constants ────────────────────────────────────────────────────────────

describe('traffic-tier-storage — constants', () => {
  it('exposes the well-known storage key', () => {
    expect(TRAFFIC_TIER_KEY).toBe('ice-cost-traffic-tier');
  });

  it('exposes a default index pointing at "Moderate"', () => {
    expect(DEFAULT_TRAFFIC_TIER_INDEX).toBe(2);
    expect(TRAFFIC_TIERS[DEFAULT_TRAFFIC_TIER_INDEX]?.tier).toBe('moderate');
  });
});

// ─── loadTrafficTier ──────────────────────────────────────────────────────

describe('loadTrafficTier', () => {
  it('returns the default when nothing is stored', () => {
    expect(loadTrafficTier()).toBe(DEFAULT_TRAFFIC_TIER_INDEX);
  });

  it('returns the default when the stored value is the empty string', () => {
    store.set(TRAFFIC_TIER_KEY, '');
    expect(loadTrafficTier()).toBe(DEFAULT_TRAFFIC_TIER_INDEX);
  });

  it('parses a valid integer string', () => {
    store.set(TRAFFIC_TIER_KEY, '0');
    expect(loadTrafficTier()).toBe(0);
    store.set(TRAFFIC_TIER_KEY, '1');
    expect(loadTrafficTier()).toBe(1);
    store.set(TRAFFIC_TIER_KEY, String(TRAFFIC_TIERS.length - 1));
    expect(loadTrafficTier()).toBe(TRAFFIC_TIERS.length - 1);
  });

  it('clamps a value that is below 0', () => {
    store.set(TRAFFIC_TIER_KEY, '-3');
    expect(loadTrafficTier()).toBe(0);
  });

  it('clamps a value that is above the last index', () => {
    store.set(TRAFFIC_TIER_KEY, String(TRAFFIC_TIERS.length + 50));
    expect(loadTrafficTier()).toBe(TRAFFIC_TIERS.length - 1);
  });

  it('parses leading-numeric strings via parseInt (e.g. "3abc" → 3)', () => {
    store.set(TRAFFIC_TIER_KEY, '3abc');
    expect(loadTrafficTier()).toBe(3);
  });

  it('returns the default when getItem throws (private-browsing mode)', () => {
    installStub({
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(loadTrafficTier()).toBe(DEFAULT_TRAFFIC_TIER_INDEX);
  });
});

// ─── saveTrafficTier ──────────────────────────────────────────────────────

describe('saveTrafficTier', () => {
  it('persists the value as a string', () => {
    saveTrafficTier(4);
    expect(store.get(TRAFFIC_TIER_KEY)).toBe('4');
  });

  it('overwrites an existing value', () => {
    saveTrafficTier(2);
    saveTrafficTier(5);
    expect(store.get(TRAFFIC_TIER_KEY)).toBe('5');
  });

  it('serializes negative and zero values verbatim (clamping happens on read)', () => {
    saveTrafficTier(0);
    expect(store.get(TRAFFIC_TIER_KEY)).toBe('0');
    saveTrafficTier(-1);
    expect(store.get(TRAFFIC_TIER_KEY)).toBe('-1');
  });

  it('silently swallows quota / SecurityError throws from setItem', () => {
    installStub({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => saveTrafficTier(2)).not.toThrow();
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────

describe('round-trip', () => {
  it('save then load returns the same in-range value', () => {
    saveTrafficTier(1);
    expect(loadTrafficTier()).toBe(1);
  });

  it('save out-of-range, load returns clamped value', () => {
    saveTrafficTier(99);
    expect(loadTrafficTier()).toBe(TRAFFIC_TIERS.length - 1);
  });
});
