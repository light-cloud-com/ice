/**
 * Reducer tests for ai-slice.
 *
 * Covers every reducer action plus the streaming history cap (20-entry FIFO).
 * No async thunks live in the slice itself — the AI command lifecycle is
 * driven by `startAiRequest`, `setAiResponse`, `addStreamedOperation`,
 * `finishStreaming`, and `setAiError` synchronously from the consuming hooks.
 */

import { describe, it, expect } from 'vitest';
import aiReducer, {
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
  type AiState,
} from '../ai-slice';
import type { Card } from '../cards-slice';
import type { AiResponse, AiCanvasOp } from '@ice/types';

function init(): AiState {
  return aiReducer(undefined, { type: '@@INIT' });
}

function makeOp(overrides: Partial<AiCanvasOp> = {}): AiCanvasOp {
  return { type: 'add_node', node: { id: 'n-1' } } as unknown as AiCanvasOp;
}

function makeResponse(overrides: Partial<AiResponse> = {}): AiResponse {
  return {
    explanation: 'because',
    operations: [makeOp()],
    suggestions: ['try this'],
    ...overrides,
  };
}

function makeCard(): Card {
  return {
    id: 'card-1',
    name: 'C',
    nodes: [],
    edges: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    createdAt: 0,
  };
}

describe('ai-slice', () => {
  it('seeds the initial state', () => {
    const s = init();
    expect(s.isProcessing).toBe(false);
    expect(s.currentIntent).toBeNull();
    expect(s.lastResponse).toBeNull();
    expect(s.pendingOperations).toEqual([]);
    expect(s.lastCanvasSnapshot).toBeNull();
    expect(s.error).toBeNull();
    expect(s.history).toEqual([]);
    expect(s.streamingStatus).toBeNull();
    expect(s.suggestions).toEqual([]);
    expect(s.animatingNodes).toEqual({});
    expect(s.animatingEdges).toEqual({});
  });

  describe('startAiRequest', () => {
    it('resets error/response/operations/suggestions and sets the analyzing status', () => {
      // Pre-seed everything so we can prove startAiRequest clears it.
      let s = aiReducer(init(), setAiError('boom'));
      s = aiReducer(s, setAiResponse(makeResponse()));
      s = aiReducer(s, setSuggestions(['leftover']));
      s = aiReducer(s, startAiRequest('add a database'));
      expect(s.isProcessing).toBe(true);
      expect(s.currentIntent).toBe('add a database');
      expect(s.error).toBeNull();
      expect(s.lastResponse).toBeNull();
      expect(s.pendingOperations).toEqual([]);
      expect(s.suggestions).toEqual([]);
      expect(s.streamingStatus).toBe('Analyzing your canvas...');
    });
  });

  describe('setStreamingStatus', () => {
    it('replaces the status string', () => {
      const s = aiReducer(init(), setStreamingStatus('Generating ops...'));
      expect(s.streamingStatus).toBe('Generating ops...');
    });
  });

  describe('setAiResponse', () => {
    it('stores response, mirrors operations + suggestions, ends processing', () => {
      let s = aiReducer(init(), startAiRequest('intent'));
      s = aiReducer(s, setAiResponse(makeResponse()));
      expect(s.lastResponse?.explanation).toBe('because');
      expect(s.pendingOperations).toHaveLength(1);
      expect(s.suggestions).toEqual(['try this']);
      expect(s.isProcessing).toBe(false);
      expect(s.streamingStatus).toBeNull();
    });

    it('falls back to an empty suggestions array when payload omits the field', () => {
      const partial: AiResponse = {
        explanation: 'bare',
        operations: [],
      };
      const s = aiReducer(init(), setAiResponse(partial));
      expect(s.suggestions).toEqual([]);
    });
  });

  describe('addStreamedOperation', () => {
    it('appends to pendingOperations preserving insertion order', () => {
      let s = init();
      const op1 = makeOp();
      const op2 = { ...makeOp(), id: 'op-2' } as unknown as AiCanvasOp;
      s = aiReducer(s, addStreamedOperation(op1));
      s = aiReducer(s, addStreamedOperation(op2));
      expect(s.pendingOperations).toHaveLength(2);
      expect(s.pendingOperations[0]).toBe(op1);
      expect(s.pendingOperations[1]).toBe(op2);
    });
  });

  describe('setExplanation', () => {
    it('initializes lastResponse with the explanation when null', () => {
      const s = aiReducer(init(), setExplanation('first thoughts'));
      expect(s.lastResponse).toEqual({
        explanation: 'first thoughts',
        operations: [],
      });
    });

    it('updates explanation in place when lastResponse already exists', () => {
      let s = aiReducer(init(), setAiResponse(makeResponse({ explanation: 'old' })));
      s = aiReducer(s, setExplanation('new'));
      expect(s.lastResponse?.explanation).toBe('new');
      // operations preserved.
      expect(s.lastResponse?.operations).toHaveLength(1);
    });
  });

  describe('setSuggestions', () => {
    it('replaces the suggestions array', () => {
      const s = aiReducer(init(), setSuggestions(['a', 'b']));
      expect(s.suggestions).toEqual(['a', 'b']);
    });
  });

  describe('finishStreaming', () => {
    it('flushes pending ops + suggestions onto an existing lastResponse', () => {
      let s = aiReducer(init(), setExplanation('mid-stream'));
      s = aiReducer(s, addStreamedOperation(makeOp()));
      s = aiReducer(s, setSuggestions(['s1']));
      s = aiReducer(s, finishStreaming());
      expect(s.isProcessing).toBe(false);
      expect(s.streamingStatus).toBeNull();
      expect(s.lastResponse?.operations).toHaveLength(1);
      expect(s.lastResponse?.suggestions).toEqual(['s1']);
    });

    it('seeds an empty-explanation response when none exists', () => {
      let s = aiReducer(init(), addStreamedOperation(makeOp()));
      s = aiReducer(s, finishStreaming());
      expect(s.lastResponse).toEqual({
        explanation: '',
        operations: expect.any(Array),
        suggestions: [],
      });
      expect(s.lastResponse?.operations).toHaveLength(1);
    });
  });

  describe('setCanvasSnapshot / clearCanvasSnapshot', () => {
    it('stores and clears the snapshot', () => {
      const card = makeCard();
      let s = aiReducer(init(), setCanvasSnapshot(card));
      expect(s.lastCanvasSnapshot).toBe(card);
      s = aiReducer(s, clearCanvasSnapshot());
      expect(s.lastCanvasSnapshot).toBeNull();
    });
  });

  describe('addToHistory', () => {
    it('prepends a timestamped entry to the front', () => {
      const before = Date.now();
      const s = aiReducer(init(), addToHistory({ intent: 'add db', explanation: 'done', operationCount: 2 }));
      expect(s.history).toHaveLength(1);
      expect(s.history[0].intent).toBe('add db');
      expect(s.history[0].timestamp).toBeGreaterThanOrEqual(before);
    });

    it('keeps prepend ordering — most recent first', () => {
      let s = aiReducer(init(), addToHistory({ intent: 'first', explanation: '', operationCount: 0 }));
      s = aiReducer(s, addToHistory({ intent: 'second', explanation: '', operationCount: 0 }));
      expect(s.history[0].intent).toBe('second');
      expect(s.history[1].intent).toBe('first');
    });

    it('caps history at 20 entries (FIFO eviction from the tail)', () => {
      let s = init();
      for (let i = 0; i < 25; i++) {
        s = aiReducer(s, addToHistory({ intent: `intent-${i}`, explanation: '', operationCount: 0 }));
      }
      expect(s.history).toHaveLength(20);
      // Most recent is intent-24, oldest kept is intent-5.
      expect(s.history[0].intent).toBe('intent-24');
      expect(s.history[19].intent).toBe('intent-5');
    });
  });

  describe('setAiError', () => {
    it('sets error and tears down processing/streaming flags', () => {
      let s = aiReducer(init(), startAiRequest('intent'));
      s = aiReducer(s, setAiError('rate-limited'));
      expect(s.error).toBe('rate-limited');
      expect(s.isProcessing).toBe(false);
      expect(s.streamingStatus).toBeNull();
    });
  });

  describe('clearAiState', () => {
    it('resets transient fields without touching history or animations', () => {
      let s = aiReducer(init(), startAiRequest('intent'));
      s = aiReducer(s, setAiResponse(makeResponse()));
      s = aiReducer(s, addToHistory({ intent: 'past', explanation: '', operationCount: 1 }));
      s = aiReducer(s, setAnimatingNodes({ 'node-1': 100 }));
      s = aiReducer(s, clearAiState());
      expect(s.isProcessing).toBe(false);
      expect(s.currentIntent).toBeNull();
      expect(s.lastResponse).toBeNull();
      expect(s.pendingOperations).toEqual([]);
      expect(s.error).toBeNull();
      expect(s.streamingStatus).toBeNull();
      expect(s.suggestions).toEqual([]);
      // History + animations are not in the clear set.
      expect(s.history).toHaveLength(1);
      expect(s.animatingNodes).toEqual({ 'node-1': 100 });
    });
  });

  describe('clearPendingOperations', () => {
    it('resets the pending ops list to empty', () => {
      let s = aiReducer(init(), addStreamedOperation(makeOp()));
      s = aiReducer(s, clearPendingOperations());
      expect(s.pendingOperations).toEqual([]);
    });
  });

  describe('animation reducers', () => {
    it('setAnimatingNodes replaces the record', () => {
      const s = aiReducer(init(), setAnimatingNodes({ a: 0, b: 100 }));
      expect(s.animatingNodes).toEqual({ a: 0, b: 100 });
    });

    it('setAnimatingEdges replaces the record', () => {
      const s = aiReducer(init(), setAnimatingEdges({ 'e-1': 50 }));
      expect(s.animatingEdges).toEqual({ 'e-1': 50 });
    });

    it('clearAnimations resets both to empty objects', () => {
      let s = aiReducer(init(), setAnimatingNodes({ a: 0 }));
      s = aiReducer(s, setAnimatingEdges({ e: 10 }));
      s = aiReducer(s, clearAnimations());
      expect(s.animatingNodes).toEqual({});
      expect(s.animatingEdges).toEqual({});
    });
  });
});
