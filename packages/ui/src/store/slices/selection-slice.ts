/**
 * Selection State Slice
 *
 * Manages selection state for nodes and edges,
 * plus box selection rectangle for drag-to-select.
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionState {
  selectedNodes: string[];
  selectedEdges: string[];
  lastSelectedNode: string | null;
  /** Box selection rectangle (canvas coordinates), null when not selecting */
  selectionRect: SelectionRect | null;
}

const initialState: SelectionState = {
  selectedNodes: [],
  selectedEdges: [],
  lastSelectedNode: null,
  selectionRect: null,
};

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    setSelectedNodes: (state, action: PayloadAction<string[]>) => {
      state.selectedNodes = action.payload;
      state.lastSelectedNode = action.payload[action.payload.length - 1] || null;
    },
    setSelectedEdges: (state, action: PayloadAction<string[]>) => {
      state.selectedEdges = action.payload;
    },
    selectAll: (state, action: PayloadAction<{ nodes: string[]; edges: string[] }>) => {
      state.selectedNodes = action.payload.nodes;
      state.selectedEdges = action.payload.edges;
    },
    clearSelection: (state) => {
      state.selectedNodes = [];
      state.selectedEdges = [];
      state.lastSelectedNode = null;
    },
    toggleNodeSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedNodes.indexOf(action.payload);
      if (index === -1) {
        state.selectedNodes.push(action.payload);
        state.lastSelectedNode = action.payload;
      } else {
        state.selectedNodes.splice(index, 1);
        if (state.lastSelectedNode === action.payload) {
          state.lastSelectedNode = state.selectedNodes[state.selectedNodes.length - 1] || null;
        }
      }
    },
    // Box selection
    setSelectionRect: (state, action: PayloadAction<SelectionRect | null>) => {
      state.selectionRect = action.payload;
    },
  },
});

export const { setSelectedNodes, setSelectedEdges, selectAll, clearSelection, toggleNodeSelection, setSelectionRect } =
  selectionSlice.actions;

export default selectionSlice.reducer;
