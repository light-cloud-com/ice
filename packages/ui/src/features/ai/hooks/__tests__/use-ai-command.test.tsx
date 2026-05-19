/**
 * useAiCommand — capture-ref hook tests.
 *
 * Cover three callbacks (sendIntent / applyOperations / undoAi), the
 * SSE stream parser, the JSON-fallback path, the various error branches,
 * and the file-private animation-order helpers.
 *
 * Mocks:
 *   - axios-instance for getAccessToken
 *   - global fetch for the canvas-intent POST
 *   - operation-executor for executeAiOperations (tested separately)
 *   - serialize-canvas (defensive — not load-bearing here)
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'tok'),
  serializeCanvas: vi.fn(() => ({ nodes: [], edges: [] })),
  executeAiOperations: vi.fn(),
  // Settable per-test surrogate for the global store module
  storeRef: { current: null as any },
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getAccessToken: () => mocks.getAccessToken(),
}));

vi.mock('../../utils/serialize-canvas', () => ({
  serializeCanvas: (...args: any[]) => (mocks.serializeCanvas as any)(...args),
}));

vi.mock('../../services/operation-executor', () => ({
  executeAiOperations: (...args: any[]) => (mocks.executeAiOperations as any)(...args),
}));

// Redirect the global `store` singleton import to our per-test store ref.
vi.mock('../../../../store', async (orig) => {
  const actual = await orig<typeof import('../../../../store')>();
  return {
    ...actual,
    get store() {
      return mocks.storeRef.current ?? actual.store;
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import aiReducer from '../../../../store/slices/ai-slice';
import cardsReducer, { type Card } from '../../../../store/slices/cards-slice';
import { useAiCommand } from '../use-ai-command';
import type { AiCanvasOp } from '@ice/types';

// ─── Store + Probe ──────────────────────────────────────────────────────────

const ACTIVE_CARD: Card = {
  id: 'card-1',
  name: 'C',
  nodes: [],
  edges: [],
  viewport: { panX: 0, panY: 0, scale: 1 },
  createdAt: 0,
};

function makeStore(card: Card | null = ACTIVE_CARD) {
  const preloadedState: any = card
    ? {
        cards: { activeCardId: card.id, cards: [card], history: {} },
      }
    : {
        cards: { activeCardId: null, cards: [], history: {} },
      };
  const store = configureStore({
    reducer: { ai: aiReducer, cards: cardsReducer } as any,
    preloadedState,
  });
  // Make the hook's internal `store.getState()` see this same store.
  mocks.storeRef.current = store;
  return store;
}

type Captured = ReturnType<typeof useAiCommand>;

function captureHook(store: ReturnType<typeof makeStore>): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    captured.current = useAiCommand();
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: any, status = 200, contentType = 'application/json'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(body: string, status = 500): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'text/plain' },
    json: async () => {
      throw new Error('not json');
    },
    text: async () => body,
  } as unknown as Response;
}

function sseResponse(chunks: string[]): Response {
  let i = 0;
  const enc = new TextEncoder();
  const reader = {
    read: vi.fn(async () => {
      if (i < chunks.length) return { done: false, value: enc.encode(chunks[i++]) };
      return { done: true, value: undefined };
    }),
    releaseLock: vi.fn(),
  };
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: { getReader: () => reader },
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccessToken.mockReturnValue('tok');
  mocks.serializeCanvas.mockReturnValue({ nodes: [], edges: [] });
  mocks.executeAiOperations.mockReturnValue({
    result: { success: true, executedOps: 0, skippedOps: [], createdNodeIds: new Map() },
    snapshot: null,
  });
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ────────────────────────────────────────────────────────────────────────────
// Initial return shape
// ────────────────────────────────────────────────────────────────────────────

describe('useAiCommand — return shape', () => {
  it('returns stable callback identities and derived selectors', () => {
    const cap = captureHook(makeStore());
    expect(typeof cap.sendIntent).toBe('function');
    expect(typeof cap.applyOperations).toBe('function');
    expect(typeof cap.undoAi).toBe('function');
    expect(cap.isProcessing).toBe(false);
    expect(cap.canUndo).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// sendIntent
// ────────────────────────────────────────────────────────────────────────────

describe('sendIntent — guards', () => {
  it('no-ops when isProcessing is already true', async () => {
    const store = makeStore();
    store.dispatch({ type: 'ai/startAiRequest', payload: 'previous' });
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sets error and bails when no active card', async () => {
    const store = makeStore(null);
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(store.getState().ai.error).toBe('No active card');
  });
});

describe('sendIntent — request + headers', () => {
  it('omits Authorization header when token is empty', async () => {
    mocks.getAccessToken.mockReturnValue('');
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({ operations: [] }));
    const cap = captureHook(makeStore());

    await cap.sendIntent('do thing');

    const callArgs = (globalThis.fetch as any).mock.calls[0];
    expect(callArgs[1].headers).not.toHaveProperty('Authorization');
  });

  it('includes Authorization header when token is set', async () => {
    mocks.getAccessToken.mockReturnValue('the-token');
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({ operations: [] }));
    const cap = captureHook(makeStore());

    await cap.sendIntent('do thing');

    const headers = (globalThis.fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer the-token');
  });
});

describe('sendIntent — non-2xx error responses', () => {
  it('503 dispatches AI_NOT_CONFIGURED message', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(textResponse('busy', 503));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    expect(store.getState().ai.error).toContain('AI_NOT_CONFIGURED');
  });

  it('503 with parseable JSON still uses the AI_NOT_CONFIGURED message', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({ message: 'whatever' }, 503, 'application/json'));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    expect(store.getState().ai.error).toContain('AI_NOT_CONFIGURED');
  });

  it('500 with JSON body extracts message', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'service down' }),
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    expect(store.getState().ai.error).toBe('service down');
  });

  it('500 with non-JSON body falls back to body text', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      text: async () => 'plain error',
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    expect(store.getState().ai.error).toBe('plain error');
  });

  it('500 with JSON body lacking .message falls back to status text', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ note: 'no message field' }),
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.error).toBe('Request failed: 500');
  });

  it('500 with empty body falls back to status text', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'text/plain' },
      text: async () => '',
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    expect(store.getState().ai.error).toBe('Request failed: 500');
  });
});

describe('sendIntent — content-type header missing', () => {
  it('treats absent content-type as JSON fallback path', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ operations: [{ op: 'autoOrganize' }] }),
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.pendingOperations.length).toBe(1);
  });
});

describe('sendIntent — JSON path', () => {
  it('dispatches addStreamedOperation per operation, sets explanation/suggestions, finishes', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      jsonResponse({
        operations: [{ op: 'autoOrganize' } as AiCanvasOp],
        explanation: 'doing it',
        suggestions: ['try X'],
      }),
    );
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');

    const ai = store.getState().ai;
    expect(ai.pendingOperations).toEqual([{ op: 'autoOrganize' }]);
    expect(ai.lastResponse?.explanation).toBe('doing it');
    expect(ai.suggestions).toEqual(['try X']);
    expect(ai.isProcessing).toBe(false);
  });

  it('warns when operations array is empty', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({ operations: [] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cap = captureHook(makeStore());

    await cap.sendIntent('do thing');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('No operations in response'),
      expect.any(Object),
    );
    warn.mockRestore();
  });

  it('handles missing operations field (undefined → empty array)', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(jsonResponse({}));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cap = captureHook(makeStore());

    await cap.sendIntent('do thing');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    log.mockRestore();
  });
});

describe('sendIntent — SSE path', () => {
  it('parses thinking / operation / explanation / suggestions / done events', async () => {
    const chunks = [
      'event: thinking\ndata: {"status":"Analyzing..."}\n\n',
      'event: operation\ndata: {"op":"autoOrganize"}\n\n',
      'event: explanation\ndata: {"text":"x"}\n\n',
      'event: suggestions\ndata: {"items":["a","b"]}\n\n',
      'event: done\ndata: {}\n\n',
    ];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    const ai = store.getState().ai;
    expect(ai.streamingStatus).toBeNull(); // finishStreaming clears it
    expect(ai.pendingOperations.length).toBe(1);
    expect(ai.lastResponse?.explanation).toBe('x');
    expect(ai.suggestions).toEqual(['a', 'b']);
  });

  it('parses error event and dispatches setAiError', async () => {
    const chunks = ['event: error\ndata: {"message":"sse failed"}\n\n'];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.error).toBe('sse failed');
  });

  it('falls back to default messages for missing payload fields', async () => {
    const chunks = [
      'event: thinking\ndata: {}\n\n',
      'event: explanation\ndata: {}\n\n',
      'event: error\ndata: {}\n\n',
    ];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    // setAiError fired with the default 'Unknown AI error'
    expect(store.getState().ai.error).toBe('Unknown AI error');
  });

  it('ignores malformed JSON in SSE data lines', async () => {
    const chunks = ['event: operation\ndata: not-json\n\n'];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    // Should not throw and still dispatch finishStreaming via the finally
    await cap.sendIntent('do thing');
    expect(store.getState().ai.isProcessing).toBe(false);
  });

  it('falls back to finishStreaming when SSE body has no reader', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: null,
    });
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.isProcessing).toBe(false);
  });

  it('exposes the trailing-incomplete-line buffer between reads', async () => {
    // The parser keeps the last line in `buffer` across reads. Ship the
    // event lines split *before* the trailing blank line so the second
    // read's blank-line completion fires the dispatch.
    const chunks = [
      'event: operation\ndata: {"op":"autoOrganize"}\n\nev',
      'ent: explanation\ndata: {"text":"x"}\n\n',
    ];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    // First read fires the operation. Second read picks up "ev" + "ent: explanation..."
    // and fires the explanation. So one op + one explanation.
    expect(store.getState().ai.pendingOperations.length).toBe(1);
    expect(store.getState().ai.lastResponse?.explanation).toBe('x');
  });

  it('persists eventType across reads when the event spans chunks (findings #12)', async () => {
    // The bug: eventType / eventData used to be reset on every read()
    // iteration, so an SSE event whose `event:` line landed in chunk
    // N and whose `data:` + blank-line landed in chunk N+1 silently
    // dropped — the second-chunk processing of `data:` had no event
    // type, and the trailing blank line failed the
    // `eventType && eventData` gate.
    //
    // The fix hoists parser state outside the loop so the event still
    // dispatches when the boundary falls between `event:` and `data:`.
    const chunks = [
      'event: operation\n', // chunk 1: only the event-type line + LF
      'data: {"op":"autoOrganize"}\n\n', // chunk 2: the data line + blank line
    ];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.pendingOperations.length).toBe(1);
  });

  it('handles unknown SSE event types silently', async () => {
    const chunks = ['event: mystery\ndata: {"x":1}\n\n'];
    (globalThis.fetch as any).mockResolvedValueOnce(sseResponse(chunks));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.isProcessing).toBe(false);
  });
});

describe('sendIntent — fetch throws', () => {
  it('catches network errors and dispatches setAiError with the message', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('offline'));
    const store = makeStore();
    const cap = captureHook(store);

    await cap.sendIntent('do thing');
    expect(store.getState().ai.error).toBe('offline');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// applyOperations
// ────────────────────────────────────────────────────────────────────────────

describe('applyOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined when there are no pending operations', () => {
    const store = makeStore();
    const cap = captureHook(store);

    const out = cap.applyOperations();
    expect(out).toBeUndefined();
    expect(mocks.executeAiOperations).not.toHaveBeenCalled();
  });

  it('runs executor, dispatches snapshot if returned, sets animations, schedules clear', () => {
    const store = makeStore();
    // Seed pending ops via the slice
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: {
        op: 'addNode',
        node: { id: 'ai-1', type: 'block', position: { x: 0, y: 0 }, data: { iceType: 'Network.VPC' } },
      } as AiCanvasOp,
    });
    const fakeSnapshot = { id: 'card-1', nodes: [], edges: [] } as any;
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 1,
        skippedOps: [],
        createdNodeIds: new Map([['ai-1', 'real-1']]),
      },
      snapshot: fakeSnapshot,
    });

    const cap = captureHook(store);
    const out = cap.applyOperations();

    expect(out?.executedOps).toBe(1);
    const ai = store.getState().ai;
    expect(ai.lastCanvasSnapshot).toEqual(fakeSnapshot);
    expect(ai.animatingNodes).toEqual({ 'real-1': 0 });
    expect(ai.pendingOperations).toEqual([]); // clearPendingOperations dispatched
  });

  it('does not dispatch snapshot when executor returns null snapshot', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'autoOrganize' } as AiCanvasOp,
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: { success: true, executedOps: 1, skippedOps: [], createdNodeIds: new Map() },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.lastCanvasSnapshot).toBeNull();
  });

  it('warns when there are skipped ops', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'autoOrganize' } as AiCanvasOp,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: false,
        executedOps: 0,
        skippedOps: [{ op: { op: 'autoOrganize' }, reason: 'oops' }],
        createdNodeIds: new Map(),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(warn).toHaveBeenCalledWith('Skipped AI operations:', expect.any(Array));
    warn.mockRestore();
  });

  it('schedules clearAnimations after maxDelay + 600ms', () => {
    const store = makeStore();
    // Seed two add ops with different priorities → produces stagger
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: {
        op: 'addNode',
        node: { id: 'ai-1', type: 'block', position: { x: 0, y: 0 }, data: { iceType: 'Network.VPC' } },
      },
    });
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: {
        op: 'addNode',
        node: { id: 'ai-2', type: 'block', position: { x: 0, y: 0 }, data: { iceType: 'Database.PostgreSQL' } },
      },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 2,
        skippedOps: [],
        createdNodeIds: new Map([
          ['ai-1', 'real-1'],
          ['ai-2', 'real-2'],
        ]),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    // maxDelay = 1 * 120 = 120, scheduled at 720ms
    expect(store.getState().ai.animatingNodes['real-1']).toBe(0);
    expect(store.getState().ai.animatingNodes['real-2']).toBe(120);
    vi.advanceTimersByTime(800);
    expect(store.getState().ai.animatingNodes).toEqual({});
  });

  it('uses currentIntent and lastResponse explanation in history entry', () => {
    const store = makeStore();
    store.dispatch({ type: 'ai/startAiRequest', payload: 'my intent' });
    store.dispatch({
      type: 'ai/setExplanation',
      payload: 'why we did it',
    });
    store.dispatch({ type: 'ai/finishStreaming' });
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'autoOrganize' } as AiCanvasOp,
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: { success: true, executedOps: 5, skippedOps: [], createdNodeIds: new Map() },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    const hist = store.getState().ai.history;
    expect(hist[0]).toMatchObject({
      intent: 'my intent',
      explanation: 'why we did it',
      operationCount: 5,
    });
  });

  it('falls back to empty intent/explanation when slice has none', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'autoOrganize' } as AiCanvasOp,
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: { success: true, executedOps: 1, skippedOps: [], createdNodeIds: new Map() },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.history[0].intent).toBe('');
    expect(store.getState().ai.history[0].explanation).toBe('');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// undoAi
// ────────────────────────────────────────────────────────────────────────────

describe('undoAi', () => {
  it('no-ops when there is no snapshot', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const cap = captureHook(store);
    dispatchSpy.mockClear();

    cap.undoAi();
    // No importToActiveCard / clearCanvasSnapshot
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).not.toContain('cards/importToActiveCard');
    expect(types).not.toContain('ai/clearCanvasSnapshot');
  });

  it('imports snapshot back to active card and clears it', () => {
    const store = makeStore();
    const snap = { nodes: [{ id: 'x' }], edges: [{ id: 'e' }] } as any;
    store.dispatch({ type: 'ai/setCanvasSnapshot', payload: snap });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const cap = captureHook(store);
    dispatchSpy.mockClear();

    cap.undoAi();
    const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain('cards/importToActiveCard');
    expect(types).toContain('ai/clearCanvasSnapshot');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeAnimationOrder — exercised through applyOperations
// ────────────────────────────────────────────────────────────────────────────

describe('animation ordering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('addBlueprint resolves real id via op.id (no iceType match needed)', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'addBlueprint', id: 'ai-bp-X', iceType: 'Compute.SSRSite' },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 1,
        skippedOps: [],
        // Only id mapping, not iceType
        createdNodeIds: new Map([['ai-bp-X', 'real-X']]),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.animatingNodes['real-X']).toBe(0);
  });

  it('exercises Compute./Function/Container/Database./Storage./Network./Security./IAM./Monitoring. priorities', () => {
    const store = makeStore();
    const types = [
      'Compute.Function',
      'Database.PostgreSQL',
      'Storage.Bucket',
      'Network.LoadBalancer',
      'Security.WAF',
      'IAM.Role',
      'Monitoring.Log',
      'OtherCategory.MyContainer', // hits .includes('Container')
      'CustomFunction', // hits .includes('Function')
      'OtherCDN', // hits .includes('CDN')
      'NetLoadBalancer', // hits .includes('LoadBalancer')
    ];
    types.forEach((iceType, i) => {
      store.dispatch({
        type: 'ai/addStreamedOperation',
        payload: {
          op: 'addNode',
          node: { id: `n-${i}`, type: 'block', position: { x: 0, y: 0 }, data: { iceType } },
        },
      });
    });
    const idMap = new Map<string, string>();
    types.forEach((_, i) => idMap.set(`n-${i}`, `r-${i}`));
    mocks.executeAiOperations.mockReturnValueOnce({
      result: { success: true, executedOps: types.length, skippedOps: [], createdNodeIds: idMap },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    // All resolved
    types.forEach((_, i) => {
      expect(typeof store.getState().ai.animatingNodes[`r-${i}`]).toBe('number');
    });
  });

  it('addBlueprint resolves real id via op.id then iceType', () => {
    const store = makeStore();
    // First blueprint with op.id, second with no op.id (resolved via iceType)
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'addBlueprint', id: 'ai-bp-1', iceType: 'Network.VPC' },
    });
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'addBlueprint', iceType: 'Database.PostgreSQL' },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 2,
        skippedOps: [],
        createdNodeIds: new Map([
          ['ai-bp-1', 'real-bp-1'],
          ['Database.PostgreSQL', 'real-bp-2'],
        ]),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.animatingNodes['real-bp-1']).toBe(0);
    expect(store.getState().ai.animatingNodes['real-bp-2']).toBe(120);
  });

  it('addEdge appears after add ops in stagger', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: {
        op: 'addNode',
        node: { id: 'ai-1', type: 'block', position: { x: 0, y: 0 }, data: { iceType: 'Network.VPC' } },
      },
    });
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'addEdge', edge: { id: 'ai-e1', source: 'a', target: 'b' } },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 2,
        skippedOps: [],
        createdNodeIds: new Map([
          ['ai-1', 'real-1'],
          ['ai-e1', 'real-e1'],
        ]),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.animatingEdges['real-e1']).toBe(120); // edge stagger after VPC
  });

  it('non-animating ops (deleteNode) do not appear in animation maps', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'deleteNode', nodeId: 'n' },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 1,
        skippedOps: [],
        createdNodeIds: new Map(),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.animatingNodes).toEqual({});
    expect(store.getState().ai.animatingEdges).toEqual({});
  });

  it('container/group node and various iceTypes get sorted by layer', () => {
    const store = makeStore();
    // Various types to stress getLayerPriority branches
    const types = [
      ['Network.Subnet', 'block'],
      ['Group.Frontend', 'container'],
      ['Compute.Container', 'block'],
      ['Database.Redis', 'block'],
      ['Network.LoadBalancer', 'block'],
      ['Security.WAF', 'block'],
      ['Custom.Misc', 'block'],
    ];
    types.forEach(([iceType, type], i) => {
      store.dispatch({
        type: 'ai/addStreamedOperation',
        payload: {
          op: 'addNode',
          node: { id: `ai-${i}`, type: type as any, position: { x: 0, y: 0 }, data: { iceType } },
        },
      });
    });
    const idMap = new Map<string, string>();
    types.forEach((_, i) => idMap.set(`ai-${i}`, `r-${i}`));
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: types.length,
        skippedOps: [],
        createdNodeIds: idMap,
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    const nodes = store.getState().ai.animatingNodes;
    // Ordered by priority — Subnet(1) < Group(2) < block(3, Container) < Compute(4)
    // < Database(5) < Network(6) < Security(7) < default(8)
    expect(nodes['r-0']).toBeLessThan(nodes['r-1']); // Subnet < Group
    expect(nodes['r-1']).toBeLessThan(nodes['r-2']); // Group < Compute (block-typed)
    expect(nodes['r-3']).toBeLessThan(nodes['r-4']); // Database < LB
  });

  it('handles addBlueprint with neither op.id nor a real iceType match', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: { op: 'addBlueprint', iceType: 'Unknown.Thing' },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: {
        success: true,
        executedOps: 0,
        skippedOps: [],
        // No mapping for the iceType
        createdNodeIds: new Map(),
      },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    // Empty animatingNodes since no realId resolved
    expect(store.getState().ai.animatingNodes).toEqual({});
  });

  it('addNode without idMap entry uses op.node.id directly', () => {
    const store = makeStore();
    store.dispatch({
      type: 'ai/addStreamedOperation',
      payload: {
        op: 'addNode',
        node: { id: 'kept-id', type: 'block', position: { x: 0, y: 0 }, data: { iceType: 'Compute.Function' } },
      },
    });
    mocks.executeAiOperations.mockReturnValueOnce({
      result: { success: true, executedOps: 1, skippedOps: [], createdNodeIds: new Map() },
      snapshot: null,
    });
    const cap = captureHook(store);
    cap.applyOperations();
    expect(store.getState().ai.animatingNodes['kept-id']).toBe(0);
  });
});
