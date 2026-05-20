/**
 * UI State Slice
 *
 * Manages UI state including:
 * - Panel visibility
 * - Theme
 * - Viewport settings
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PaneViewport {
  panX: number;
  panY: number;
  scale: number;
}

interface SplitPane {
  id: string;
  cardId: string; // Currently active card in this pane
  openCardIds: string[]; // List of open tabs in this pane
  viewport: PaneViewport; // Viewport is per-pane, not per-card
}

export interface SplitViewState {
  enabled: boolean;
  direction: 'horizontal' | 'vertical'; // horizontal = side-by-side, vertical = top-bottom
  panes: SplitPane[];
  activePaneId: string;
}

export type EdgeStyle = 'bezier' | 'straight' | 'rectangular';
export type OrganizeStyle = 'vertical' | 'horizontal' | 'circular';

export interface UIState {
  // Panel visibility
  showPalette: boolean;
  showBlocks: boolean;
  showProperties: boolean;
  showMinimap: boolean;
  showValidation: boolean;
  showAiChat: boolean;
  showCostPanel: boolean;
  showTemplates: boolean;

  /** Category to pre-filter when opening the template gallery */
  templateGalleryCategory: string | null;

  // Edge / connection line style
  edgeStyle: EdgeStyle;

  // Auto-organize on zoom (LOD transitions)
  autoOrganizeOnZoom: boolean;
  autoOrganizeStyle: OrganizeStyle;

  // Canvas interaction settings
  snapToGrid: boolean;
  gridSize: number;
  canvasLocked: boolean;

  // Theme
  theme: 'light' | 'dark' | 'system';

  // Viewport
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };

  // Context menu
  contextMenu: {
    isOpen: boolean;
    position: { x: number; y: number };
    canvasPosition: { x: number; y: number };
    type: 'canvas' | 'node' | 'edge' | null;
    targetId: string | null;
  };

  // Dialogs
  dialogs: {
    newGraph: boolean;
    importTerraform: boolean;
    settings: boolean;
    plan: boolean;
    apply: boolean;
    templatePicker: boolean;
    templateGallery: boolean;
    projectWizard: boolean;
    aiCommand: boolean;
  };

  // Split view
  splitView: SplitViewState;

  /**
   * Optional override for the resizable sidebars. When non-null, the
   * `DragResizePanel` instances ignore their persisted width and render
   * at the override width. The tour engine sets these to the panel's
   * `maxWidth` on entry and clears them on exit so guided steps fit.
   */
  sidebarOverride: { left: number | null; right: number | null };
}

// =============================================================================
// Defaults (no localStorage — UI prefs persist via the user-preferences
// endpoint, see task #13. Until that lands, prefs reset on reload.)
// =============================================================================

const PANEL_DEFAULTS = {
  showPalette: true,
  showBlocks: true,
  showProperties: false,
  showMinimap: true,
  showValidation: false,
  showAiChat: true,
  showCostPanel: false,
  showTemplates: false,
};

const PANES_DEFAULT: SplitViewState = {
  enabled: false,
  direction: 'horizontal',
  panes: [
    {
      id: 'pane-1',
      cardId: 'demo',
      openCardIds: ['demo'],
      viewport: { panX: 0, panY: 0, scale: 1 },
    },
  ],
  activePaneId: 'pane-1',
};

const persistedPanels = PANEL_DEFAULTS;

const initialState: UIState = {
  ...persistedPanels,
  templateGalleryCategory: null,
  edgeStyle: 'bezier' as EdgeStyle,
  autoOrganizeOnZoom: false,
  autoOrganizeStyle: 'vertical' as OrganizeStyle,
  snapToGrid: true,
  gridSize: 20,
  canvasLocked: false,
  theme: 'system',
  viewport: { x: 0, y: 0, zoom: 1 },
  contextMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    canvasPosition: { x: 0, y: 0 },
    type: null,
    targetId: null,
  },
  dialogs: {
    newGraph: false,
    importTerraform: false,
    settings: false,
    plan: false,
    apply: false,
    templatePicker: false,
    templateGallery: false,
    projectWizard: false,
    aiCommand: false,
  },
  splitView: PANES_DEFAULT,
  sidebarOverride: { left: null, right: null },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    togglePalette: (state) => {
      state.showPalette = !state.showPalette;
    },
    toggleBlocks: (state) => {
      state.showBlocks = !state.showBlocks;
    },
    toggleProperties: (state) => {
      state.showProperties = !state.showProperties;
    },
    toggleMinimap: (state) => {
      state.showMinimap = !state.showMinimap;
    },
    toggleAiChat: (state) => {
      state.showAiChat = !state.showAiChat;
    },
    toggleCostPanel: (state) => {
      state.showCostPanel = !state.showCostPanel;
    },
    /**
     * Direct boolean setters for the tour engine — `toggle*` is wrong
     * when the caller needs to *guarantee* a panel is open (or closed)
     * regardless of current state.
     */
    setShowPalette: (state, action: PayloadAction<boolean>) => {
      state.showPalette = action.payload;
    },
    setShowBlocks: (state, action: PayloadAction<boolean>) => {
      state.showBlocks = action.payload;
    },
    setShowProperties: (state, action: PayloadAction<boolean>) => {
      state.showProperties = action.payload;
    },
    setShowAiChat: (state, action: PayloadAction<boolean>) => {
      state.showAiChat = action.payload;
    },
    setShowCostPanel: (state, action: PayloadAction<boolean>) => {
      state.showCostPanel = action.payload;
    },
    setShowTemplates: (state, action: PayloadAction<boolean>) => {
      state.showTemplates = action.payload;
    },
    /**
     * Override (or clear) the rendered width of one of the side
     * sidebars. `null` clears the override and the panel falls back to
     * its persisted local width. The override is intentionally NOT
     * persisted — it's a transient state used by the tour engine.
     */
    setSidebarOverride: (state, action: PayloadAction<{ side: 'left' | 'right'; width: number | null }>) => {
      state.sidebarOverride[action.payload.side] = action.payload.width;
    },
    toggleValidation: (state) => {
      state.showValidation = !state.showValidation;
    },
    openValidation: (state) => {
      state.showValidation = true;
    },
    toggleTemplates: (state) => {
      state.showTemplates = !state.showTemplates;
    },
    openTemplateGallery: (state, action: PayloadAction<string | null>) => {
      state.templateGalleryCategory = action.payload;
      state.dialogs.templateGallery = true;
    },
    closeTemplateGallery: (state) => {
      state.dialogs.templateGallery = false;
      state.templateGalleryCategory = null;
    },
    setEdgeStyle: (state, action: PayloadAction<EdgeStyle>) => {
      state.edgeStyle = action.payload;
    },
    toggleAutoOrganizeOnZoom: (state) => {
      state.autoOrganizeOnZoom = !state.autoOrganizeOnZoom;
    },
    setAutoOrganizeStyle: (state, action: PayloadAction<OrganizeStyle>) => {
      state.autoOrganizeStyle = action.payload;
    },
    toggleSnapToGrid: (state) => {
      state.snapToGrid = !state.snapToGrid;
    },
    setGridSize: (state, action: PayloadAction<number>) => {
      state.gridSize = Math.max(5, Math.min(100, action.payload));
    },
    toggleCanvasLocked: (state) => {
      state.canvasLocked = !state.canvasLocked;
    },
    openContextMenu: (
      state,
      action: PayloadAction<{
        position: { x: number; y: number };
        canvasPosition?: { x: number; y: number };
        type: 'canvas' | 'node' | 'edge';
        targetId?: string;
      }>,
    ) => {
      state.contextMenu = {
        isOpen: true,
        position: action.payload.position,
        canvasPosition: action.payload.canvasPosition || { x: 0, y: 0 },
        type: action.payload.type,
        targetId: action.payload.targetId || null,
      };
    },
    closeContextMenu: (state) => {
      state.contextMenu = {
        isOpen: false,
        position: { x: 0, y: 0 },
        canvasPosition: { x: 0, y: 0 },
        type: null,
        targetId: null,
      };
    },
    openDialog: (state, action: PayloadAction<keyof UIState['dialogs']>) => {
      state.dialogs[action.payload] = true;
    },
    closeDialog: (state, action: PayloadAction<keyof UIState['dialogs']>) => {
      state.dialogs[action.payload] = false;
    },

    // Split view actions
    splitRight: (state, action: PayloadAction<string>) => {
      // action.payload is the cardId to show in the new pane
      if (state.splitView.enabled) return; // Already split

      // Copy viewport from current pane as starting point.
      // findings.md #51 — the `?.` + `||` fallback is defensive but
      // unreachable: initial state ships one pane, loadPersistedPanes
      // gates restoration on `parsed.panes.length > 0`, and
      // closeSplit keeps ≥1 pane. Kept as a belt-and-braces guard
      // against a future corrupt-restore path.
      const currentViewport = state.splitView.panes[0]?.viewport || { panX: 0, panY: 0, scale: 1 };
      const newPaneId = `pane-${Date.now()}`;
      state.splitView.enabled = true;
      state.splitView.direction = 'horizontal';
      state.splitView.panes.push({
        id: newPaneId,
        cardId: action.payload,
        openCardIds: [action.payload],
        viewport: { ...currentViewport },
      });
      state.splitView.activePaneId = newPaneId;
    },

    splitDown: (state, action: PayloadAction<string>) => {
      // action.payload is the cardId to show in the new pane
      if (state.splitView.enabled) return; // Already split

      // Copy viewport from current pane as starting point.
      // findings.md #51 — see splitRight; same dormant defensive
      // fallback, kept for parity.
      const currentViewport = state.splitView.panes[0]?.viewport || { panX: 0, panY: 0, scale: 1 };
      const newPaneId = `pane-${Date.now()}`;
      state.splitView.enabled = true;
      state.splitView.direction = 'vertical';
      state.splitView.panes.push({
        id: newPaneId,
        cardId: action.payload,
        openCardIds: [action.payload],
        viewport: { ...currentViewport },
      });
      state.splitView.activePaneId = newPaneId;
    },

    closeSplit: (state) => {
      // Return to single pane - keep the active pane
      const activePane = state.splitView.panes.find((p) => p.id === state.splitView.activePaneId);
      state.splitView.enabled = false;
      state.splitView.panes = activePane ? [activePane] : [state.splitView.panes[0]];
      state.splitView.activePaneId = state.splitView.panes[0].id;
    },

    setPaneCard: (state, action: PayloadAction<{ paneId: string; cardId: string }>) => {
      const pane = state.splitView.panes.find((p) => p.id === action.payload.paneId);
      if (pane) {
        pane.cardId = action.payload.cardId;
        // Add to open tabs if not already open
        if (!pane.openCardIds.includes(action.payload.cardId)) {
          pane.openCardIds.push(action.payload.cardId);
        }
        // Reset viewport when switching cards
        pane.viewport = { panX: 0, panY: 0, scale: 1 };
      }
    },

    // Open a new tab in a specific pane
    openTabInPane: (state, action: PayloadAction<{ paneId: string; cardId: string }>) => {
      const pane = state.splitView.panes.find((p) => p.id === action.payload.paneId);
      if (pane) {
        if (!pane.openCardIds.includes(action.payload.cardId)) {
          pane.openCardIds.push(action.payload.cardId);
        }
        pane.cardId = action.payload.cardId;
        pane.viewport = { panX: 0, panY: 0, scale: 1 };
      }
    },

    // Close a tab in a specific pane (allows closing the last tab → empty pane)
    closeTabInPane: (state, action: PayloadAction<{ paneId: string; cardId: string }>) => {
      const pane = state.splitView.panes.find((p) => p.id === action.payload.paneId);
      if (!pane) return;
      const index = pane.openCardIds.indexOf(action.payload.cardId);
      if (index !== -1) {
        pane.openCardIds.splice(index, 1);
        // If we closed the active tab, switch to another or clear
        if (pane.cardId === action.payload.cardId) {
          if (pane.openCardIds.length > 0) {
            pane.cardId = pane.openCardIds[Math.max(0, index - 1)];
          } else {
            pane.cardId = '';
          }
          pane.viewport = { panX: 0, panY: 0, scale: 1 };
        }
      }
    },

    // Close all tabs for specific card IDs in all panes (used when deleting projects)
    closeTabsByCardIds: (state, action: PayloadAction<string[]>) => {
      const cardIdsToClose = new Set(action.payload);
      for (const pane of state.splitView.panes) {
        pane.openCardIds = pane.openCardIds.filter((id) => !cardIdsToClose.has(id));
        if (cardIdsToClose.has(pane.cardId)) {
          pane.cardId = pane.openCardIds[0] || '';
          pane.viewport = { panX: 0, panY: 0, scale: 1 };
        }
      }
    },

    setActivePane: (state, action: PayloadAction<string>) => {
      if (state.splitView.panes.some((p) => p.id === action.payload)) {
        state.splitView.activePaneId = action.payload;
      }
    },

    // Update viewport for a specific pane
    setPaneViewport: (state, action: PayloadAction<{ paneId: string; viewport: PaneViewport }>) => {
      const pane = state.splitView.panes.find((p) => p.id === action.payload.paneId);
      if (pane) {
        pane.viewport = action.payload.viewport;
      }
    },

    /**
     * Hydrate panel-visibility + split-view from the user-preferences
     * DB payload. Called once on app boot. Skips fields whose payload
     * is null/undefined so a partial blob doesn't blow away in-memory
     * state already changed this session.
     */
    loadUiPrefs: (
      state,
      action: PayloadAction<{
        panels?: Partial<typeof PANEL_DEFAULTS>;
        splitView?: SplitViewState;
      } | null>,
    ) => {
      if (!action.payload) return;
      const { panels, splitView } = action.payload;
      if (panels && typeof panels === 'object') {
        if (typeof panels.showPalette === 'boolean') state.showPalette = panels.showPalette;
        if (typeof panels.showBlocks === 'boolean') state.showBlocks = panels.showBlocks;
        if (typeof panels.showProperties === 'boolean') state.showProperties = panels.showProperties;
        if (typeof panels.showMinimap === 'boolean') state.showMinimap = panels.showMinimap;
        if (typeof panels.showValidation === 'boolean') state.showValidation = panels.showValidation;
        if (typeof panels.showAiChat === 'boolean') state.showAiChat = panels.showAiChat;
        if (typeof panels.showCostPanel === 'boolean') state.showCostPanel = panels.showCostPanel;
        if (typeof panels.showTemplates === 'boolean') state.showTemplates = panels.showTemplates;
      }
      if (splitView && Array.isArray(splitView.panes) && splitView.panes.length > 0) {
        state.splitView = splitView;
      }
    },
  },
});

export const {
  togglePalette,
  toggleBlocks,
  toggleProperties,
  toggleMinimap,
  toggleAiChat,
  toggleCostPanel,
  setShowPalette,
  setShowBlocks,
  setShowProperties,
  setShowAiChat,
  setShowCostPanel,
  setShowTemplates,
  setSidebarOverride,
  toggleTemplates,
  openTemplateGallery,
  closeTemplateGallery,
  setEdgeStyle,
  openContextMenu,
  closeContextMenu,
  openDialog,
  closeDialog,
  splitRight,
  splitDown,
  closeSplit,
  setPaneCard,
  setActivePane,
  setPaneViewport,
  loadUiPrefs,
  openTabInPane,
  closeTabInPane,
  closeTabsByCardIds,
  toggleAutoOrganizeOnZoom,
  setAutoOrganizeStyle,
  toggleSnapToGrid,
  setGridSize,
  toggleCanvasLocked,
  toggleValidation,
  openValidation,
} = uiSlice.actions;

export default uiSlice.reducer;
