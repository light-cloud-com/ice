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

interface SplitViewState {
  enabled: boolean;
  direction: 'horizontal' | 'vertical'; // horizontal = side-by-side, vertical = top-bottom
  panes: SplitPane[];
  activePaneId: string;
}

export type EdgeStyle = 'bezier' | 'straight' | 'rectangular';
export type OrganizeStyle = 'vertical' | 'horizontal' | 'circular';

interface UIState {
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
}

// =============================================================================
// Persistence (pane tabs only)
// =============================================================================

const UI_STORAGE_KEY = 'ice-ui-panes';

function loadPersistedPanes(): SplitViewState {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.panes && parsed.panes.length > 0) {
        return {
          enabled: parsed.enabled || false,
          direction: parsed.direction || 'horizontal',
          panes: parsed.panes.map((p: any) => ({
            id: p.id || 'pane-1',
            cardId: p.cardId || 'demo',
            openCardIds: p.openCardIds || [p.cardId || 'demo'],
            viewport: { panX: 0, panY: 0, scale: 1 },
          })),
          activePaneId: parsed.activePaneId || 'pane-1',
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
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
}

const initialState: UIState = {
  showPalette: true,
  showBlocks: true,
  showProperties: false,
  showMinimap: true,
  showValidation: false,
  showAiChat: true,
  showCostPanel: false,
  showTemplates: false,
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
  splitView: loadPersistedPanes(),
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
        type: 'canvas' | 'node' | 'edge';
        targetId?: string;
      }>,
    ) => {
      state.contextMenu = {
        isOpen: true,
        position: action.payload.position,
        type: action.payload.type,
        targetId: action.payload.targetId || null,
      };
    },
    closeContextMenu: (state) => {
      state.contextMenu = {
        isOpen: false,
        position: { x: 0, y: 0 },
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

      // Copy viewport from current pane as starting point
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

      // Copy viewport from current pane as starting point
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
  },
});

export const {
  togglePalette,
  toggleBlocks,
  toggleProperties,
  toggleMinimap,
  toggleAiChat,
  toggleCostPanel,
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
