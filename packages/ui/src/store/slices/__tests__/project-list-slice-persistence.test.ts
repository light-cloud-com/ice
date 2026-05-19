/**
 * project-list-slice — `loadPersistedState` branches.
 *
 * The function runs once at module-init reading localStorage. Alternate
 * branches require `vi.resetModules()` between imports so each test gets a
 * fresh module evaluation against a freshly-stubbed localStorage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

function stubStorage(rootValue: string | null, expandedJson: string | null, throwOnGet: boolean = false) {
  const storage = { ice: rootValue, expanded: expandedJson };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => {
        if (throwOnGet) throw new Error('storage-disabled');
        if (key === 'ice-project-list-root') return storage.ice;
        if (key === 'ice-project-list-expanded') return storage.expanded;
        return null;
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe('project-list-slice loadPersistedState (init paths)', () => {
  it('initializes with empty expandedFolders when JSON key is absent', async () => {
    stubStorage(null, null);
    const mod = await import('../project-list-slice');
    const s = mod.default(undefined, { type: '@@INIT' });
    expect(s.rootDirectory).toBeNull();
    expect(s.expandedFolders).toEqual([]);
  });

  it('parses persisted expandedFolders array', async () => {
    stubStorage('/Users/me/projects', JSON.stringify(['/p/a', '/p/b']));
    const mod = await import('../project-list-slice');
    const s = mod.default(undefined, { type: '@@INIT' });
    expect(s.rootDirectory).toBe('/Users/me/projects');
    expect(s.expandedFolders).toEqual(['/p/a', '/p/b']);
  });

  it('falls back to null root when localStorage value is empty string', async () => {
    // Empty string: `rootDirectory || null` returns null.
    stubStorage('', null);
    const mod = await import('../project-list-slice');
    const s = mod.default(undefined, { type: '@@INIT' });
    expect(s.rootDirectory).toBeNull();
  });

  it('returns safe defaults when localStorage throws', async () => {
    stubStorage(null, null, /* throwOnGet */ true);
    const mod = await import('../project-list-slice');
    const s = mod.default(undefined, { type: '@@INIT' });
    expect(s.rootDirectory).toBeNull();
    expect(s.expandedFolders).toEqual([]);
  });

  it('returns safe defaults when JSON.parse throws', async () => {
    stubStorage('/root', '{not-valid-json');
    const mod = await import('../project-list-slice');
    const s = mod.default(undefined, { type: '@@INIT' });
    // The catch swallows everything, returns the default shape.
    expect(s.rootDirectory).toBeNull();
    expect(s.expandedFolders).toEqual([]);
  });
});
