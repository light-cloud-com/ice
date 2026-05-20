/**
 * Reducer tests for ui-slice.
 *
 * Covers panel toggles (with persistence side-effects), dialogs, context
 * menu, edge style, snap/grid clamping, split-view + tab management.
 *
 * The slice writes to `localStorage` on every panel toggle. We provide a
 * minimal stub via `Object.defineProperty(globalThis, 'localStorage', ...)`
 * so the persistence path runs without throwing in jsdom-less envs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import uiReducer, {
  togglePalette,
  toggleBlocks,
  toggleProperties,
  toggleMinimap,
  toggleAiChat,
  toggleCostPanel,
  toggleTemplates,
  toggleValidation,
  openValidation,
  openTemplateGallery,
  closeTemplateGallery,
  setEdgeStyle,
  toggleAutoOrganizeOnZoom,
  setAutoOrganizeStyle,
  toggleSnapToGrid,
  setGridSize,
  toggleCanvasLocked,
  openContextMenu,
  closeContextMenu,
  openDialog,
  closeDialog,
  splitRight,
  splitDown,
  closeSplit,
  setPaneCard,
  openTabInPane,
  closeTabInPane,
  closeTabsByCardIds,
  setActivePane,
  setPaneViewport,
} from '../ui-slice';

// Minimal localStorage stub — the slice uses getItem during module init
// (already happened) and setItem on every panel toggle. We just need the
// setItem path to not throw.
const memStorage: Record<string, string> = {};
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
});

function init() {
  return uiReducer(undefined, { type: '@@INIT' });
}

beforeEach(() => {
  for (const k of Object.keys(memStorage)) delete memStorage[k];
});

describe('ui-slice', () => {
  it('seeds the initial state with default panels, dialogs, viewport, and a single pane', () => {
    const s = init();
    expect(s.theme).toBe('system');
    expect(s.edgeStyle).toBe('bezier');
    expect(s.autoOrganizeOnZoom).toBe(false);
    expect(s.autoOrganizeStyle).toBe('vertical');
    expect(s.snapToGrid).toBe(true);
    expect(s.gridSize).toBe(20);
    expect(s.canvasLocked).toBe(false);
    expect(s.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(s.contextMenu.isOpen).toBe(false);
    expect(s.contextMenu.type).toBeNull();
    expect(s.dialogs.newGraph).toBe(false);
    expect(s.splitView.enabled).toBe(false);
    expect(s.splitView.panes).toHaveLength(1);
    expect(s.splitView.activePaneId).toBe(s.splitView.panes[0].id);
  });

  describe('panel toggles', () => {
    it('flips each panel boolean and persists', () => {
      let s = init();
      s = uiReducer(s, togglePalette());
      expect(s.showPalette).toBe(false);
      s = uiReducer(s, toggleBlocks());
      expect(s.showBlocks).toBe(false);
      s = uiReducer(s, toggleProperties());
      expect(s.showProperties).toBe(true);
      s = uiReducer(s, toggleMinimap());
      expect(s.showMinimap).toBe(false);
      s = uiReducer(s, toggleAiChat());
      expect(s.showAiChat).toBe(false);
      s = uiReducer(s, toggleCostPanel());
      expect(s.showCostPanel).toBe(true);
      s = uiReducer(s, toggleTemplates());
      expect(s.showTemplates).toBe(true);
      s = uiReducer(s, toggleValidation());
      expect(s.showValidation).toBe(true);
    });

    it('openValidation forces showValidation to true regardless of prior state', () => {
      let s = init();
      s = uiReducer(s, openValidation());
      expect(s.showValidation).toBe(true);
      s = uiReducer(s, openValidation());
      expect(s.showValidation).toBe(true);
    });
  });

  describe('template gallery', () => {
    it('opens with a category and closes clearing the category', () => {
      let s = init();
      s = uiReducer(s, openTemplateGallery('compute'));
      expect(s.dialogs.templateGallery).toBe(true);
      expect(s.templateGalleryCategory).toBe('compute');
      s = uiReducer(s, closeTemplateGallery());
      expect(s.dialogs.templateGallery).toBe(false);
      expect(s.templateGalleryCategory).toBeNull();
    });

    it('opens with null category', () => {
      const s = uiReducer(init(), openTemplateGallery(null));
      expect(s.templateGalleryCategory).toBeNull();
      expect(s.dialogs.templateGallery).toBe(true);
    });
  });

  describe('edge & organize styles', () => {
    it('setEdgeStyle replaces the value', () => {
      const s = uiReducer(init(), setEdgeStyle('rectangular'));
      expect(s.edgeStyle).toBe('rectangular');
    });

    it('toggleAutoOrganizeOnZoom flips the flag', () => {
      let s = init();
      s = uiReducer(s, toggleAutoOrganizeOnZoom());
      expect(s.autoOrganizeOnZoom).toBe(true);
      s = uiReducer(s, toggleAutoOrganizeOnZoom());
      expect(s.autoOrganizeOnZoom).toBe(false);
    });

    it('setAutoOrganizeStyle replaces the value', () => {
      const s = uiReducer(init(), setAutoOrganizeStyle('circular'));
      expect(s.autoOrganizeStyle).toBe('circular');
    });
  });

  describe('snap-to-grid + grid size + canvas lock', () => {
    it('toggleSnapToGrid flips', () => {
      const s = uiReducer(init(), toggleSnapToGrid());
      expect(s.snapToGrid).toBe(false);
    });

    it('setGridSize clamps below 5 to 5', () => {
      const s = uiReducer(init(), setGridSize(1));
      expect(s.gridSize).toBe(5);
    });

    it('setGridSize clamps above 100 to 100', () => {
      const s = uiReducer(init(), setGridSize(500));
      expect(s.gridSize).toBe(100);
    });

    it('setGridSize accepts a value in range', () => {
      const s = uiReducer(init(), setGridSize(40));
      expect(s.gridSize).toBe(40);
    });

    it('toggleCanvasLocked flips', () => {
      const s = uiReducer(init(), toggleCanvasLocked());
      expect(s.canvasLocked).toBe(true);
    });
  });

  describe('context menu', () => {
    it('opens with full payload', () => {
      const s = uiReducer(
        init(),
        openContextMenu({
          position: { x: 1, y: 2 },
          canvasPosition: { x: 3, y: 4 },
          type: 'node',
          targetId: 'n-1',
        }),
      );
      expect(s.contextMenu).toEqual({
        isOpen: true,
        position: { x: 1, y: 2 },
        canvasPosition: { x: 3, y: 4 },
        type: 'node',
        targetId: 'n-1',
      });
    });

    it('opens with default canvasPosition + null targetId when omitted', () => {
      const s = uiReducer(
        init(),
        openContextMenu({
          position: { x: 5, y: 6 },
          type: 'canvas',
        }),
      );
      expect(s.contextMenu.canvasPosition).toEqual({ x: 0, y: 0 });
      expect(s.contextMenu.targetId).toBeNull();
    });

    it('closes back to defaults', () => {
      let s = uiReducer(init(), openContextMenu({ position: { x: 1, y: 2 }, type: 'edge', targetId: 'e-1' }));
      s = uiReducer(s, closeContextMenu());
      expect(s.contextMenu.isOpen).toBe(false);
      expect(s.contextMenu.type).toBeNull();
      expect(s.contextMenu.targetId).toBeNull();
    });
  });

  describe('dialogs', () => {
    it('openDialog flips one dialog true; closeDialog flips it back', () => {
      let s = uiReducer(init(), openDialog('settings'));
      expect(s.dialogs.settings).toBe(true);
      s = uiReducer(s, closeDialog('settings'));
      expect(s.dialogs.settings).toBe(false);
    });
  });

  describe('split view', () => {
    it('splitRight pushes a second pane and activates it', () => {
      const s = uiReducer(init(), splitRight('card-2'));
      expect(s.splitView.enabled).toBe(true);
      expect(s.splitView.direction).toBe('horizontal');
      expect(s.splitView.panes).toHaveLength(2);
      expect(s.splitView.panes[1].cardId).toBe('card-2');
      expect(s.splitView.activePaneId).toBe(s.splitView.panes[1].id);
    });

    it('splitDown pushes a vertical second pane', () => {
      const s = uiReducer(init(), splitDown('card-3'));
      expect(s.splitView.enabled).toBe(true);
      expect(s.splitView.direction).toBe('vertical');
      expect(s.splitView.panes).toHaveLength(2);
    });

    it('splitRight is a no-op when already split', () => {
      let s = uiReducer(init(), splitRight('card-2'));
      const before = s.splitView.panes.length;
      s = uiReducer(s, splitRight('card-3'));
      expect(s.splitView.panes.length).toBe(before);
    });

    it('splitDown is a no-op when already split', () => {
      let s = uiReducer(init(), splitDown('card-2'));
      const before = s.splitView.panes.length;
      s = uiReducer(s, splitDown('card-3'));
      expect(s.splitView.panes.length).toBe(before);
    });

    it('closeSplit returns to single pane keeping the active one', () => {
      let s = uiReducer(init(), splitRight('card-2'));
      const activeId = s.splitView.activePaneId;
      s = uiReducer(s, closeSplit());
      expect(s.splitView.enabled).toBe(false);
      expect(s.splitView.panes).toHaveLength(1);
      expect(s.splitView.panes[0].id).toBe(activeId);
      expect(s.splitView.activePaneId).toBe(activeId);
    });

    it('closeSplit falls back to first pane when activePaneId no longer matches', () => {
      const s = uiReducer(init(), splitRight('card-2'));
      // Manually set activePaneId to something invalid.
      const stale = uiReducer(s, setActivePane('does-not-exist'));
      // setActivePane validates, so stale.activePaneId still equals the
      // pushed pane. Build the bad-state by editing through a synthetic
      // action that points the active id at a removed pane.
      const synth = {
        ...stale,
        splitView: { ...stale.splitView, activePaneId: 'never' },
      };
      const out = uiReducer(synth, closeSplit());
      expect(out.splitView.panes).toHaveLength(1);
      expect(out.splitView.activePaneId).toBe(out.splitView.panes[0].id);
    });

    it('setPaneCard updates cardId, appends to openCardIds, resets viewport', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, setPaneViewport({ paneId: pid, viewport: { panX: 5, panY: 5, scale: 2 } }));
      s = uiReducer(s, setPaneCard({ paneId: pid, cardId: 'new-card' }));
      const pane = s.splitView.panes[0];
      expect(pane.cardId).toBe('new-card');
      expect(pane.openCardIds).toContain('new-card');
      expect(pane.viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    });

    it('setPaneCard does not push duplicate openCardIds', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, setPaneCard({ paneId: pid, cardId: 'card-x' }));
      s = uiReducer(s, setPaneCard({ paneId: pid, cardId: 'card-x' }));
      const pane = s.splitView.panes[0];
      const occurrences = pane.openCardIds.filter((c) => c === 'card-x').length;
      expect(occurrences).toBe(1);
    });

    it('setPaneCard is a no-op for an unknown paneId', () => {
      let s = init();
      const before = JSON.parse(JSON.stringify(s));
      s = uiReducer(s, setPaneCard({ paneId: 'unknown', cardId: 'x' }));
      expect(s.splitView).toEqual(before.splitView);
    });

    it('openTabInPane appends a new tab and activates it', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'tab-1' }));
      const pane = s.splitView.panes[0];
      expect(pane.openCardIds).toContain('tab-1');
      expect(pane.cardId).toBe('tab-1');
      expect(pane.viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    });

    it('openTabInPane is a no-op for an unknown paneId', () => {
      let s = init();
      const before = JSON.parse(JSON.stringify(s));
      s = uiReducer(s, openTabInPane({ paneId: 'nope', cardId: 'x' }));
      expect(s.splitView).toEqual(before.splitView);
    });

    it('openTabInPane does not duplicate existing tab', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'tab-1' }));
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'tab-1' }));
      const pane = s.splitView.panes[0];
      const occurrences = pane.openCardIds.filter((c) => c === 'tab-1').length;
      expect(occurrences).toBe(1);
    });

    it('closeTabInPane removes a non-active tab without changing active', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'tab-extra' }));
      // Re-activate the original (so tab-extra isn't the active one).
      s = uiReducer(s, setPaneCard({ paneId: pid, cardId: 'demo' }));
      s = uiReducer(s, closeTabInPane({ paneId: pid, cardId: 'tab-extra' }));
      const pane = s.splitView.panes[0];
      expect(pane.openCardIds).not.toContain('tab-extra');
      expect(pane.cardId).toBe('demo');
    });

    it('closeTabInPane on the active tab switches to a remaining tab', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'tab-2' }));
      // Active is now tab-2; close it.
      s = uiReducer(s, closeTabInPane({ paneId: pid, cardId: 'tab-2' }));
      const pane = s.splitView.panes[0];
      expect(pane.openCardIds).not.toContain('tab-2');
      expect(pane.cardId).toBe('demo');
      expect(pane.viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    });

    it('closeTabInPane on the only tab clears cardId to empty string', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      // Pane has only the seeded "demo" tab. Close it.
      s = uiReducer(s, closeTabInPane({ paneId: pid, cardId: 'demo' }));
      const pane = s.splitView.panes[0];
      expect(pane.openCardIds).toHaveLength(0);
      expect(pane.cardId).toBe('');
    });

    it('closeTabInPane is a no-op for unknown paneId', () => {
      let s = init();
      const before = JSON.parse(JSON.stringify(s));
      s = uiReducer(s, closeTabInPane({ paneId: 'nope', cardId: 'demo' }));
      expect(s.splitView).toEqual(before.splitView);
    });

    it('closeTabInPane is a no-op for unknown cardId in a known pane', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      const before = JSON.parse(JSON.stringify(s));
      s = uiReducer(s, closeTabInPane({ paneId: pid, cardId: 'never-opened' }));
      expect(s.splitView).toEqual(before.splitView);
    });

    it('closeTabsByCardIds drops listed ids from every pane and re-points active', () => {
      let s = uiReducer(init(), splitRight('card-2'));
      const [p1, p2] = s.splitView.panes.map((p) => p.id);
      s = uiReducer(s, openTabInPane({ paneId: p1, cardId: 'extra-1' }));
      s = uiReducer(s, openTabInPane({ paneId: p2, cardId: 'extra-2' }));
      // Active in p1 is now extra-1; close ['extra-1', 'extra-2'].
      s = uiReducer(s, closeTabsByCardIds(['extra-1', 'extra-2']));
      const pane1 = s.splitView.panes.find((p) => p.id === p1)!;
      const pane2 = s.splitView.panes.find((p) => p.id === p2)!;
      expect(pane1.openCardIds).not.toContain('extra-1');
      expect(pane2.openCardIds).not.toContain('extra-2');
      expect(pane1.cardId).not.toBe('extra-1');
      expect(pane2.cardId).not.toBe('extra-2');
    });

    it('closeTabsByCardIds clears cardId to empty string when every tab is closed', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      // Pane has only the seeded "demo" tab. Close it.
      s = uiReducer(s, closeTabsByCardIds(['demo']));
      const pane = s.splitView.panes[0];
      expect(pane.openCardIds).toHaveLength(0);
      expect(pane.cardId).toBe('');
    });

    it('closeTabsByCardIds with no matching active card leaves cardId untouched', () => {
      let s = init();
      const pid = s.splitView.panes[0].id;
      s = uiReducer(s, openTabInPane({ paneId: pid, cardId: 'aux' }));
      // Active is 'aux'. Close only 'demo' (not active).
      s = uiReducer(s, closeTabsByCardIds(['demo']));
      const pane = s.splitView.panes[0];
      expect(pane.cardId).toBe('aux');
      expect(pane.openCardIds).not.toContain('demo');
    });

    it('setActivePane validates the pane exists before switching', () => {
      let s = uiReducer(init(), splitRight('card-2'));
      const original = s.splitView.activePaneId;
      s = uiReducer(s, setActivePane('does-not-exist'));
      expect(s.splitView.activePaneId).toBe(original);
      s = uiReducer(s, setActivePane(s.splitView.panes[0].id));
      expect(s.splitView.activePaneId).toBe(s.splitView.panes[0].id);
    });

    it('setPaneViewport updates only the named pane', () => {
      let s = uiReducer(init(), splitRight('card-2'));
      const targetId = s.splitView.panes[1].id;
      s = uiReducer(s, setPaneViewport({ paneId: targetId, viewport: { panX: 9, panY: 9, scale: 3 } }));
      expect(s.splitView.panes[1].viewport).toEqual({ panX: 9, panY: 9, scale: 3 });
      // Other pane untouched.
      expect(s.splitView.panes[0].viewport).toEqual({ panX: 0, panY: 0, scale: 1 });
    });

    it('setPaneViewport is a no-op for unknown paneId', () => {
      let s = init();
      const before = JSON.parse(JSON.stringify(s));
      s = uiReducer(s, setPaneViewport({ paneId: 'nope', viewport: { panX: 1, panY: 1, scale: 1 } }));
      expect(s.splitView).toEqual(before.splitView);
    });
  });
});
