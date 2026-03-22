/**
 * useAiCommand Hook
 *
 * Manages the AI command flow: sends intent to backend via SSE,
 * processes streamed operations, and executes them on the canvas.
 */

import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../../../store';
import { store } from '../../../store';
import { serializeCanvas } from '../utils/serialize-canvas';
import { executeAiOperations } from '../services/operation-executor';
import { importToActiveCard, selectActiveCard } from '../../../store/slices/cards-slice';
import {
  startAiRequest,
  setStreamingStatus,
  addStreamedOperation,
  setExplanation,
  setSuggestions,
  finishStreaming,
  setCanvasSnapshot,
  clearCanvasSnapshot,
  addToHistory,
  setAiError,
  clearPendingOperations,
  setAnimatingNodes,
  setAnimatingEdges,
  clearAnimations,
} from '../../../store/slices/ai-slice';
import type { AiCanvasOp, AiStreamEvent } from '@ice/types';
import { getAccessToken } from '../../../shared/api/axios-instance';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export function useAiCommand() {
  const dispatch = useDispatch<AppDispatch>();
  const isProcessing = useSelector((s: RootState) => s.ai.isProcessing);
  const pendingOperations = useSelector((s: RootState) => s.ai.pendingOperations);
  const lastResponse = useSelector((s: RootState) => s.ai.lastResponse);
  const error = useSelector((s: RootState) => s.ai.error);
  const streamingStatus = useSelector((s: RootState) => s.ai.streamingStatus);
  const suggestions = useSelector((s: RootState) => s.ai.suggestions);
  const lastCanvasSnapshot = useSelector((s: RootState) => s.ai.lastCanvasSnapshot);

  /**
   * Send an intent to the AI and stream back operations.
   */
  const sendIntent = useCallback(
    async (intent: string) => {
      if (isProcessing) return;

      dispatch(startAiRequest(intent));

      const state = store.getState();
      const canvasContext = serializeCanvas(state);
      const activeCard = selectActiveCard(state);
      if (!activeCard) {
        dispatch(setAiError('No active card'));
        return;
      }

      const token = getAccessToken();

      try {
        const response = await fetch(`${API_BASE}/ai/canvas-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            intent,
            canvasContext,
            cardId: activeCard.id,
          }),
        });

        if (!response.ok) {
          if (response.status === 503) {
            dispatch(
              setAiError(
                'AI_NOT_CONFIGURED: The AI assistant requires an Anthropic API key.\n\n' +
                  'To set up:\n' +
                  '1. Get an API key at https://console.anthropic.com/settings/keys\n' +
                  '2. Add ANTHROPIC_API_KEY=sk-ant-... to your .env file\n' +
                  '3. Restart the server',
              ),
            );
            return;
          }
          const errorBody = await response.text();
          let errorMsg = `Request failed: ${response.status}`;
          try {
            const parsed = JSON.parse(errorBody);
            errorMsg = parsed.message || errorMsg;
          } catch {
            if (errorBody) errorMsg = errorBody;
          }
          dispatch(setAiError(errorMsg));
          return;
        }

        const contentType = response.headers.get('content-type') || '';

        // SSE streaming path
        if (contentType.includes('text/event-stream')) {
          await processSSEStream(response, dispatch);
        } else {
          // Non-streaming JSON fallback
          const data = await response.json();
          console.log('[AI] Response received:', {
            hasExplanation: !!data.explanation,
            operationCount: data.operations?.length ?? 0,
            suggestionsCount: data.suggestions?.length ?? 0,
            responseKeys: Object.keys(data),
          });
          // Parse as flat AiResponse
          const operations: AiCanvasOp[] = data.operations || [];
          if (operations.length === 0) {
            console.warn('[AI] No operations in response. Full response:', data);
          }
          for (const op of operations) {
            dispatch(addStreamedOperation(op));
          }
          if (data.explanation) {
            dispatch(setExplanation(data.explanation));
          }
          if (data.suggestions) {
            dispatch(setSuggestions(data.suggestions));
          }
          dispatch(finishStreaming());
        }
      } catch (err) {
        dispatch(setAiError((err as Error).message));
      }
    },
    [dispatch, isProcessing],
  );

  /**
   * Execute the pending operations on the canvas with staggered entrance animations.
   */
  const applyOperations = useCallback(() => {
    const ops = store.getState().ai.pendingOperations;
    if (ops.length === 0) return;

    const { result, snapshot } = executeAiOperations(dispatch, ops);

    if (snapshot) {
      dispatch(setCanvasSnapshot(snapshot));
    }

    // Compute staggered animation delays based on infrastructure layer order
    const nodeDelays = computeAnimationOrder(ops, result.createdNodeIds);
    dispatch(setAnimatingNodes(nodeDelays.nodes));
    dispatch(setAnimatingEdges(nodeDelays.edges));

    // Clear animations after all have played
    const maxDelay = Math.max(...Object.values(nodeDelays.nodes), ...Object.values(nodeDelays.edges), 0);
    setTimeout(() => {
      dispatch(clearAnimations());
    }, maxDelay + 600); // animation duration (400ms) + buffer

    const intent = store.getState().ai.currentIntent || '';
    const explanation = store.getState().ai.lastResponse?.explanation || '';
    dispatch(
      addToHistory({
        intent,
        explanation,
        operationCount: result.executedOps,
      }),
    );

    dispatch(clearPendingOperations());

    if (result.skippedOps.length > 0) {
      console.warn('Skipped AI operations:', result.skippedOps);
    }

    return result;
  }, [dispatch]);

  /**
   * Undo the last AI execution by restoring the canvas snapshot.
   */
  const undoAi = useCallback(() => {
    const snapshot = store.getState().ai.lastCanvasSnapshot;
    if (!snapshot) return;

    dispatch(
      importToActiveCard({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        skipAutoOrganize: true,
      }),
    );
    dispatch(clearCanvasSnapshot());
  }, [dispatch]);

  return {
    sendIntent,
    applyOperations,
    undoAi,
    isProcessing,
    pendingOperations,
    lastResponse,
    error,
    streamingStatus,
    suggestions,
    canUndo: !!lastCanvasSnapshot,
  };
}

// =============================================================================
// Animation Order — determines stagger delays by infrastructure layer
// =============================================================================

/** Infrastructure layer priority for animation ordering */
function getLayerPriority(op: AiCanvasOp): number {
  if (op.op === 'addNode' || op.op === 'addBlueprint') {
    const iceType = op.op === 'addNode' ? (op.node.data?.iceType as string) || '' : op.blockType || '';
    const nodeType = op.op === 'addNode' ? op.node.type : '';

    // Network containers first (the "backbone")
    if (iceType === 'Network.VPC' || iceType.includes('VPC')) return 0;
    if (iceType === 'Network.Subnet' || iceType.includes('Subnet')) return 1;
    // Groups / logical containers
    if (nodeType === 'container' || iceType.startsWith('Group.')) return 2;
    // Blocks (application units)
    if (nodeType === 'block' || iceType.startsWith('Block.')) return 3;
    // Compute resources
    if (iceType.startsWith('Compute.') || iceType.includes('Container') || iceType.includes('Function')) return 4;
    // Databases & storage
    if (iceType.startsWith('Database.') || iceType.startsWith('Storage.')) return 5;
    // Networking resources (LB, CDN, DNS)
    if (iceType.startsWith('Network.') || iceType.includes('LoadBalancer') || iceType.includes('CDN')) return 6;
    // Security, IAM, monitoring
    if (iceType.startsWith('Security.') || iceType.startsWith('IAM.') || iceType.startsWith('Monitoring.')) return 7;
    // Everything else
    return 8;
  }
  // Edges always come last
  if (op.op === 'addEdge') return 10;
  // Other ops (update, delete) — don't animate
  return -1;
}

function computeAnimationOrder(
  ops: AiCanvasOp[],
  createdNodeIds: Map<string, string>,
): { nodes: Record<string, number>; edges: Record<string, number> } {
  const STAGGER_MS = 120;

  // Collect add operations with their layer priority
  const addOps: Array<{ op: AiCanvasOp; priority: number; index: number }> = [];
  ops.forEach((op, index) => {
    const priority = getLayerPriority(op);
    if (priority >= 0) {
      addOps.push({ op, priority, index });
    }
  });

  // Sort by layer priority, then by original order within same layer
  addOps.sort((a, b) => a.priority - b.priority || a.index - b.index);

  const nodes: Record<string, number> = {};
  const edges: Record<string, number> = {};
  let step = 0;

  for (const { op } of addOps) {
    const delay = step * STAGGER_MS;

    if (op.op === 'addNode') {
      const realId = createdNodeIds.get(op.node.id) || op.node.id;
      nodes[realId] = delay;
      step++;
    } else if (op.op === 'addBlueprint') {
      // Blueprint may have mapped by id or blockType
      const realId = createdNodeIds.get(op.id || '') || createdNodeIds.get(op.blockType) || op.id || '';
      if (realId) {
        nodes[realId] = delay;
        step++;
      }
    } else if (op.op === 'addEdge') {
      const realId = createdNodeIds.get(op.edge.id) || op.edge.id;
      edges[realId] = delay;
      step++;
    }
  }

  return { nodes, edges };
}

// =============================================================================
// SSE Stream Processing
// =============================================================================

async function processSSEStream(response: Response, dispatch: AppDispatch) {
  const reader = response.body?.getReader();
  if (!reader) {
    dispatch(finishStreaming());
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line

      let eventType = '';
      let eventData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        } else if (line === '' && eventType && eventData) {
          // Complete event
          try {
            const parsed = JSON.parse(eventData) as Record<string, unknown>;
            handleSSEEvent(eventType, parsed, dispatch);
          } catch {
            // Ignore malformed events
          }
          eventType = '';
          eventData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
    dispatch(finishStreaming());
  }
}

function handleSSEEvent(type: string, data: Record<string, unknown>, dispatch: AppDispatch) {
  switch (type) {
    case 'thinking':
      dispatch(setStreamingStatus((data.status as string) || 'Thinking...'));
      break;
    case 'operation':
      dispatch(addStreamedOperation(data as unknown as AiCanvasOp));
      break;
    case 'explanation':
      dispatch(setExplanation((data.text as string) || ''));
      break;
    case 'suggestions':
      dispatch(setSuggestions((data.items as string[]) || []));
      break;
    case 'error':
      dispatch(setAiError((data.message as string) || 'Unknown AI error'));
      break;
    case 'done':
      // finishStreaming is called in the finally block
      break;
  }
}
