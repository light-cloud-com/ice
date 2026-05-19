/**
 * Persistence-path coverage for ui-slice.
 *
 * The slice's `loadPersistedPanels` and `loadPersistedPanes` functions
 * run once at module-init time. To exercise their happy paths we seed
 * `localStorage` BEFORE importing the module — using `vi.resetModules`
 * + dynamic import so each test gets a fresh module instance.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory localStorage stub. Keys are seeded per-test before the
// dynamic import so the slice's module-init reads them.
const memStorage: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(memStorage)) delete memStorage[k];
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => memStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        memStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete memStorage[k];
      },
      clear: () => {
        for (const k of Object.keys(memStorage)) delete memStorage[k];
      },
    },
    writable: true,
    configurable: true,
  });
  vi.resetModules();
});

async function importFresh() {
  return await import('../ui-slice');
}

describe('ui-slice persistence', () => {
  it('reads a persisted panels payload and merges over defaults', async () => {
    memStorage['ice-ui-panels'] = JSON.stringify({
      showPalette: false,
      showProperties: true,
      showCostPanel: true,
    });
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    expect(state.showPalette).toBe(false);
    expect(state.showProperties).toBe(true);
    expect(state.showCostPanel).toBe(true);
    // Unmentioned keys retain defaults.
    expect(state.showBlocks).toBe(true);
    expect(state.showMinimap).toBe(true);
  });

  it('falls back to defaults when panels JSON is malformed', async () => {
    memStorage['ice-ui-panels'] = 'not-json';
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    expect(state.showPalette).toBe(true);
    expect(state.showBlocks).toBe(true);
  });

  it('reads persisted panes with a custom direction and openCardIds', async () => {
    memStorage['ice-ui-panes'] = JSON.stringify({
      enabled: true,
      direction: 'vertical',
      panes: [{ id: 'p-stored', cardId: 'c-stored', openCardIds: ['c-stored', 'c-tab2'] }],
      activePaneId: 'p-stored',
    });
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    expect(state.splitView.enabled).toBe(true);
    expect(state.splitView.direction).toBe('vertical');
    expect(state.splitView.panes).toHaveLength(1);
    expect(state.splitView.panes[0].id).toBe('p-stored');
    expect(state.splitView.panes[0].cardId).toBe('c-stored');
    expect(state.splitView.panes[0].openCardIds).toEqual(['c-stored', 'c-tab2']);
    expect(state.splitView.activePaneId).toBe('p-stored');
  });

  it('falls back to defaults when persisted panes payload has empty panes array', async () => {
    memStorage['ice-ui-panes'] = JSON.stringify({ panes: [] });
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    expect(state.splitView.panes).toHaveLength(1);
    expect(state.splitView.panes[0].id).toBe('pane-1');
    expect(state.splitView.panes[0].cardId).toBe('demo');
  });

  it('uses pane defaults when stored pane omits id/cardId/openCardIds', async () => {
    memStorage['ice-ui-panes'] = JSON.stringify({
      panes: [{ id: '', cardId: '' }],
    });
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    const pane = state.splitView.panes[0];
    expect(pane.id).toBe('pane-1');
    expect(pane.cardId).toBe('demo');
    expect(pane.openCardIds).toEqual(['demo']);
  });

  it('falls back to defaults when panes JSON is malformed', async () => {
    memStorage['ice-ui-panes'] = '{not-json';
    const mod = await importFresh();
    const state = mod.default(undefined, { type: '@@INIT' });
    expect(state.splitView.panes).toHaveLength(1);
    expect(state.splitView.panes[0].id).toBe('pane-1');
  });
});
