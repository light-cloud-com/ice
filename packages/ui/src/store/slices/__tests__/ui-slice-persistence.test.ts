/**
 * Persistence-path coverage for ui-slice.
 *
 * UI prefs no longer round-trip through localStorage — the slice exposes
 * `loadUiPrefs` which is dispatched by the user-preferences hydration
 * flow. These tests exercise the reducer's hydrate branches.
 */

import { describe, it, expect } from 'vitest';
import uiReducer, { loadUiPrefs } from '../ui-slice';

describe('ui-slice — loadUiPrefs hydration', () => {
  it('merges a panels payload over defaults', () => {
    const state = uiReducer(
      undefined,
      loadUiPrefs({
        panels: {
          showPalette: false,
          showProperties: true,
          showCostPanel: true,
        },
      }),
    );
    expect(state.showPalette).toBe(false);
    expect(state.showProperties).toBe(true);
    expect(state.showCostPanel).toBe(true);
    // Unmentioned keys retain defaults.
    expect(state.showBlocks).toBe(true);
    expect(state.showMinimap).toBe(true);
  });

  it('is a no-op when payload is null', () => {
    const initial = uiReducer(undefined, { type: '@@INIT' });
    const next = uiReducer(initial, loadUiPrefs(null));
    expect(next).toBe(initial);
  });

  it('hydrates splitView with a custom direction and openCardIds', () => {
    const state = uiReducer(
      undefined,
      loadUiPrefs({
        splitView: {
          enabled: true,
          direction: 'vertical',
          panes: [
            {
              id: 'p-stored',
              cardId: 'c-stored',
              openCardIds: ['c-stored', 'c-tab2'],
              viewport: { panX: 0, panY: 0, scale: 1 },
            },
          ],
          activePaneId: 'p-stored',
        },
      }),
    );
    expect(state.splitView.enabled).toBe(true);
    expect(state.splitView.direction).toBe('vertical');
    expect(state.splitView.panes).toHaveLength(1);
    expect(state.splitView.panes[0].id).toBe('p-stored');
    expect(state.splitView.panes[0].cardId).toBe('c-stored');
    expect(state.splitView.panes[0].openCardIds).toEqual(['c-stored', 'c-tab2']);
    expect(state.splitView.activePaneId).toBe('p-stored');
  });

  it('skips splitView hydration when panes array is empty', () => {
    const state = uiReducer(
      undefined,
      loadUiPrefs({
        splitView: {
          enabled: true,
          direction: 'horizontal',
          panes: [],
          activePaneId: 'pane-1',
        },
      }),
    );
    // Defaults survive.
    expect(state.splitView.panes).toHaveLength(1);
    expect(state.splitView.panes[0].id).toBe('pane-1');
    expect(state.splitView.panes[0].cardId).toBe('demo');
  });

  it('ignores non-boolean panel values', () => {
    const state = uiReducer(
      undefined,
      loadUiPrefs({
        panels: {
          // @ts-expect-error — exercise runtime guard against bad payloads
          showPalette: 'maybe',
        },
      }),
    );
    expect(state.showPalette).toBe(true);
  });
});
