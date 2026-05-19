/**
 * Tests for `cards/persistence.ts` — the localStorage loader that seeds
 * the cards slice's `initialState`.
 *
 * Covers all 8 documented branches: empty storage (record version), valid
 * payload at current version (skip rewrite), valid payload at old version
 * (migrate + rewrite + bump), demo-card filtering, the `activeCardId`
 * three-way fallback (`'demo'` -> `cards[0]?.id || null`, `undefined` ->
 * `null`, real id -> identity), the two `parsed.cards`-empty fall-throughs,
 * the outer `JSON.parse` try/catch, and both inner `localStorage.setItem`
 * try/catch wrappers (quota / private-mode resilience).
 *
 * @see rf-cards-4
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadPersistedCards } from '../persistence';

// Module-private in `persistence.ts`; mirrored here as test fixtures so
// the assertions don't depend on re-exports we don't want to add.
const CARDS_STORAGE_KEY = 'ice-cards';
const CARDS_VERSION_KEY = 'ice-cards-version';
const CARDS_DATA_VERSION = 6;

// -----------------------------------------------------------------------------
// localStorage stub
// -----------------------------------------------------------------------------

type StoreMap = Record<string, string>;

function makeLocalStorage(initial: StoreMap = {}, opts: { setItemThrows?: boolean } = {}) {
  const store: StoreMap = { ...initial };
  const getItem = vi.fn((key: string) => (key in store ? store[key] : null));
  const setItem = vi.fn((key: string, value: string) => {
    if (opts.setItemThrows) {
      throw new Error('QuotaExceededError');
    }
    store[key] = value;
  });
  return { store, getItem, setItem };
}

let ls: ReturnType<typeof makeLocalStorage>;

function installLocalStorage(initial: StoreMap = {}, opts: { setItemThrows?: boolean } = {}) {
  ls = makeLocalStorage(initial, opts);
  vi.stubGlobal('localStorage', { getItem: ls.getItem, setItem: ls.setItem });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------------
// Empty localStorage — "no prior payload, record version" branch
// -----------------------------------------------------------------------------

describe('loadPersistedCards — empty localStorage', () => {
  beforeEach(() => installLocalStorage());

  it('returns the empty initial state', () => {
    const result = loadPersistedCards();
    expect(result).toEqual({ cards: [], activeCardId: null, history: {} });
  });

  it('writes CARDS_VERSION_KEY with the current data version', () => {
    loadPersistedCards();
    expect(ls.setItem).toHaveBeenCalledTimes(1);
    expect(ls.setItem).toHaveBeenCalledWith(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
  });

  it('does not write CARDS_STORAGE_KEY (no payload to rewrite)', () => {
    loadPersistedCards();
    const storageWrites = ls.setItem.mock.calls.filter(([key]) => key === CARDS_STORAGE_KEY);
    expect(storageWrites).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Stored payload at the current data version — migrate, but skip the rewrite
// -----------------------------------------------------------------------------

describe('loadPersistedCards — stored payload at current version', () => {
  it('migrates nodes via migrateCardNodes (Monitoring.Terminal -> Monitoring.Log)', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [
          {
            id: 'c1',
            name: 'Card 1',
            nodes: [{ id: 'n1', data: { iceType: 'Monitoring.Terminal' } }],
            edges: [],
          },
        ],
        activeCardId: 'c1',
      }),
    });

    const result = loadPersistedCards();

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
    expect(result.activeCardId).toBe('c1');
  });

  it('does not call setItem (storedVersion === CARDS_DATA_VERSION skips the bump)', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [{ id: 'c1', nodes: [], edges: [] }],
        activeCardId: 'c1',
      }),
    });

    loadPersistedCards();

    expect(ls.setItem).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Stored payload at an OLD version — migrate + rewrite + bump
// -----------------------------------------------------------------------------

describe('loadPersistedCards — stored payload at old version', () => {
  beforeEach(() => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: '4',
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [
          {
            id: 'c1',
            nodes: [{ id: 'n1', data: { iceType: 'Monitoring.Terminal' } }],
            edges: [],
          },
        ],
        activeCardId: 'c1',
      }),
    });
  });

  it('migrates nodes and returns the migrated cards', () => {
    const result = loadPersistedCards();
    expect(result.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
  });

  it('writes both CARDS_STORAGE_KEY (migrated payload) and CARDS_VERSION_KEY (bumped)', () => {
    loadPersistedCards();

    const storageCall = ls.setItem.mock.calls.find(([key]) => key === CARDS_STORAGE_KEY);
    const versionCall = ls.setItem.mock.calls.find(([key]) => key === CARDS_VERSION_KEY);
    expect(storageCall).toBeDefined();
    expect(versionCall).toEqual([CARDS_VERSION_KEY, String(CARDS_DATA_VERSION)]);

    // The persisted payload reflects the migrated nodes.
    const persisted = JSON.parse(storageCall![1]);
    expect(persisted.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
    // Spread of the original `parsed` object — `activeCardId` survives.
    expect(persisted.activeCardId).toBe('c1');
  });
});

// -----------------------------------------------------------------------------
// Demo-card filtering
// -----------------------------------------------------------------------------

describe('loadPersistedCards — demo-card filtering', () => {
  it('strips a card whose id is "demo"', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [
          { id: 'demo', nodes: [], edges: [] },
          { id: 'real', nodes: [], edges: [] },
        ],
        activeCardId: 'real',
      }),
    });

    const result = loadPersistedCards();
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].id).toBe('real');
  });
});

// -----------------------------------------------------------------------------
// activeCardId three-way fallback
// -----------------------------------------------------------------------------

describe('loadPersistedCards — activeCardId fallback', () => {
  it('"demo" falls back to cards[0]?.id', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [
          { id: 'first', nodes: [], edges: [] },
          { id: 'second', nodes: [], edges: [] },
        ],
        activeCardId: 'demo',
      }),
    });

    const result = loadPersistedCards();
    expect(result.activeCardId).toBe('first');
  });

  it('"demo" with empty cards[] falls back to null', () => {
    // All non-demo cards are filtered out, so cards[0] is undefined and
    // the `cards[0]?.id || null` fallback yields null.
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [{ id: 'demo', nodes: [], edges: [] }],
        activeCardId: 'demo',
      }),
    });

    const result = loadPersistedCards();
    expect(result.activeCardId).toBeNull();
  });

  it('undefined falls back to null', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [{ id: 'c1', nodes: [], edges: [] }],
        // activeCardId is not present
      }),
    });

    const result = loadPersistedCards();
    expect(result.activeCardId).toBeNull();
  });

  it('a real id is returned as-is', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: JSON.stringify({
        cards: [{ id: 'real-card-id', nodes: [], edges: [] }],
        activeCardId: 'real-card-id',
      }),
    });

    const result = loadPersistedCards();
    expect(result.activeCardId).toBe('real-card-id');
  });
});

// -----------------------------------------------------------------------------
// parsed.cards fall-throughs — payload exists but cards are missing/empty
// -----------------------------------------------------------------------------

describe('loadPersistedCards — parsed.cards fall-through', () => {
  it('empty array falls through to "no prior payload" branch (records version)', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: '4',
      [CARDS_STORAGE_KEY]: JSON.stringify({ cards: [], activeCardId: null }),
    });

    const result = loadPersistedCards();
    expect(result).toEqual({ cards: [], activeCardId: null, history: {} });
    // Only the version-bump write fires; no CARDS_STORAGE_KEY rewrite.
    expect(ls.setItem).toHaveBeenCalledTimes(1);
    expect(ls.setItem).toHaveBeenCalledWith(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
  });

  it('undefined cards falls through too', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: '4',
      [CARDS_STORAGE_KEY]: JSON.stringify({ activeCardId: null }),
    });

    const result = loadPersistedCards();
    expect(result).toEqual({ cards: [], activeCardId: null, history: {} });
    expect(ls.setItem).toHaveBeenCalledWith(CARDS_VERSION_KEY, String(CARDS_DATA_VERSION));
  });
});

// -----------------------------------------------------------------------------
// Outer try/catch — JSON.parse throws
// -----------------------------------------------------------------------------

describe('loadPersistedCards — JSON.parse throws', () => {
  it('returns the empty initial state when the payload is corrupt', () => {
    installLocalStorage({
      [CARDS_VERSION_KEY]: String(CARDS_DATA_VERSION),
      [CARDS_STORAGE_KEY]: '{not valid json',
    });

    const result = loadPersistedCards();
    expect(result).toEqual({ cards: [], activeCardId: null, history: {} });
  });
});

// -----------------------------------------------------------------------------
// Inner try/catch — localStorage.setItem throws (quota / private mode)
// -----------------------------------------------------------------------------

describe('loadPersistedCards — localStorage.setItem throws', () => {
  it('migrate-rewrite path: returns the in-memory migrated payload anyway', () => {
    installLocalStorage(
      {
        [CARDS_VERSION_KEY]: '4',
        [CARDS_STORAGE_KEY]: JSON.stringify({
          cards: [
            {
              id: 'c1',
              nodes: [{ id: 'n1', data: { iceType: 'Monitoring.Terminal' } }],
              edges: [],
            },
          ],
          activeCardId: 'c1',
        }),
      },
      { setItemThrows: true },
    );

    const result = loadPersistedCards();
    // The first setItem call (storage rewrite) throws, caught by the
    // inner try/catch — the function still returns the migrated payload.
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].nodes[0].data.iceType).toBe('Monitoring.Log');
    expect(result.activeCardId).toBe('c1');
  });

  it('record-version path: returns the empty initial state', () => {
    installLocalStorage({}, { setItemThrows: true });

    const result = loadPersistedCards();
    // The version-bump setItem throws, caught by the second inner
    // try/catch — the function still returns the empty default.
    expect(result).toEqual({ cards: [], activeCardId: null, history: {} });
  });
});
