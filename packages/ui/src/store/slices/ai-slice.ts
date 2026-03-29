/**
 * AI State Slice
 *
 * Manages AI-related state: processing status, pending operations,
 * undo snapshots, and interaction history.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Card } from './cards-slice';
import type { AiCanvasOp, AiResponse } from '@ice/types';

// =============================================================================
// Types
// =============================================================================

interface AiHistoryEntry {
  intent: string;
  explanation: string;
  operationCount: number;
  timestamp: number;
}

interface AiState {
  /** Whether an AI request is currently in flight */
  isProcessing: boolean;
  /** The current user intent being processed */
  currentIntent: string | null;
  /** Latest AI response (for display in command palette) */
  lastResponse: AiResponse | null;
  /** Operations awaiting user approval before execution */
  pendingOperations: AiCanvasOp[];
  /** Snapshot of the card before AI execution (for undo) */
  lastCanvasSnapshot: Card | null;
  /** Error message from the last AI request */
  error: string | null;
  /** Recent AI interaction history */
  history: AiHistoryEntry[];
  /** Streaming status message (e.g. "Analyzing canvas...") */
  streamingStatus: string | null;
  /** Suggestions from the last AI response */
  suggestions: string[];
  /** Node IDs currently animating in, with their stagger delay in ms */
  animatingNodes: Record<string, number>;
  /** Edge IDs currently animating in, with their stagger delay in ms */
  animatingEdges: Record<string, number>;
}

const initialState: AiState = {
  isProcessing: false,
  currentIntent: null,
  lastResponse: null,
  pendingOperations: [],
  lastCanvasSnapshot: null,
  error: null,
  history: [],
  streamingStatus: null,
  suggestions: [],
  animatingNodes: {},
  animatingEdges: {},
};

// =============================================================================
// Slice
// =============================================================================

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    /** Start processing a new AI request */
    startAiRequest: (state, action: PayloadAction<string>) => {
      state.isProcessing = true;
      state.currentIntent = action.payload;
      state.error = null;
      state.lastResponse = null;
      state.pendingOperations = [];
      state.suggestions = [];
      state.streamingStatus = 'Analyzing your canvas...';
    },

    /** Update streaming status */
    setStreamingStatus: (state, action: PayloadAction<string>) => {
      state.streamingStatus = action.payload;
    },

    /** Set the full AI response (non-streaming path) */
    setAiResponse: (state, action: PayloadAction<AiResponse>) => {
      state.lastResponse = action.payload;
      state.pendingOperations = action.payload.operations;
      state.suggestions = action.payload.suggestions || [];
      state.isProcessing = false;
      state.streamingStatus = null;
    },

    /** Add a single operation during streaming */
    addStreamedOperation: (state, action: PayloadAction<AiCanvasOp>) => {
      state.pendingOperations.push(action.payload);
    },

    /** Set explanation during streaming */
    setExplanation: (state, action: PayloadAction<string>) => {
      if (!state.lastResponse) {
        state.lastResponse = { explanation: action.payload, operations: [] };
      } else {
        state.lastResponse.explanation = action.payload;
      }
    },

    /** Set suggestions during streaming */
    setSuggestions: (state, action: PayloadAction<string[]>) => {
      state.suggestions = action.payload;
    },

    /** Mark streaming as complete */
    finishStreaming: (state) => {
      state.isProcessing = false;
      state.streamingStatus = null;
      // Sync pending operations to lastResponse
      if (state.lastResponse) {
        state.lastResponse.operations = state.pendingOperations;
        state.lastResponse.suggestions = state.suggestions;
      } else {
        state.lastResponse = {
          explanation: '',
          operations: state.pendingOperations,
          suggestions: state.suggestions,
        };
      }
    },

    /** Store canvas snapshot before executing AI operations */
    setCanvasSnapshot: (state, action: PayloadAction<Card>) => {
      state.lastCanvasSnapshot = action.payload;
    },

    /** Clear canvas snapshot after undo */
    clearCanvasSnapshot: (state) => {
      state.lastCanvasSnapshot = null;
    },

    /** Record a completed AI interaction in history */
    addToHistory: (state, action: PayloadAction<Omit<AiHistoryEntry, 'timestamp'>>) => {
      state.history.unshift({
        ...action.payload,
        timestamp: Date.now(),
      });
      // Keep last 20 entries
      if (state.history.length > 20) {
        state.history = state.history.slice(0, 20);
      }
    },

    /** Set error state */
    setAiError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isProcessing = false;
      state.streamingStatus = null;
    },

    /** Clear all AI state (e.g. when closing palette) */
    clearAiState: (state) => {
      state.isProcessing = false;
      state.currentIntent = null;
      state.lastResponse = null;
      state.pendingOperations = [];
      state.error = null;
      state.streamingStatus = null;
      state.suggestions = [];
    },

    /** Clear pending operations after execution */
    clearPendingOperations: (state) => {
      state.pendingOperations = [];
    },

    /** Set animating nodes with their stagger delays */
    setAnimatingNodes: (state, action: PayloadAction<Record<string, number>>) => {
      state.animatingNodes = action.payload;
    },

    /** Set animating edges with their stagger delays */
    setAnimatingEdges: (state, action: PayloadAction<Record<string, number>>) => {
      state.animatingEdges = action.payload;
    },

    /** Clear all animation state */
    clearAnimations: (state) => {
      state.animatingNodes = {};
      state.animatingEdges = {};
    },
  },
});

// =============================================================================
// Exports
// =============================================================================

export const {
  startAiRequest,
  setStreamingStatus,
  setAiResponse,
  addStreamedOperation,
  setExplanation,
  setSuggestions,
  finishStreaming,
  setCanvasSnapshot,
  clearCanvasSnapshot,
  addToHistory,
  setAiError,
  clearAiState,
  clearPendingOperations,
  setAnimatingNodes,
  setAnimatingEdges,
  clearAnimations,
} = aiSlice.actions;

export default aiSlice.reducer;
