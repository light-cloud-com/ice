/**
 * useConnectionDrawing
 *
 * Connection-drawing state machine the orchestrator (`svg-canvas.tsx`)
 * used to run inline (lines 687–921 of the post-rf-canv-26 file). Owns the
 * full port-to-port edge creation flow:
 *
 *   1. **State**: a single `useState` slot for the in-flight drag descriptor
 *      (`{ sourceId, sourceRouteId?, sourcePoint, currentPoint } | null`).
 *      `null` whenever no drag is in progress.
 *   2. **`connectionDragTargets`** — a `useMemo` that walks `effectiveNodes`
 *      every render and builds a `Map<id, 'valid-target' | 'invalid-target' | 'source'>`
 *      against the source node by running `canConnect` for each candidate.
 *      `null` whenever no drag is in progress (the outer guard short-circuits
 *      the loop and the connection-preview overlay falls back to cyan, see
 *      `pickPreviewColor` / rf-canv-8 learning `empty-map-is-not-null-in-pickPreviewColor`).
 *   3. **`handleConnectionPortDown`** — the post-classList work that fires
 *      AFTER the orchestrator's onMouseDown gate has confirmed the event
 *      target carries `class="connection-port"`. Captures the target's
 *      `data-node-id` + optional `data-route-id`, calls `preventDefault` +
 *      `stopPropagation`, projects the screen-space pointer to canvas-space,
 *      and writes the descriptor into state.
 *   4. **`handleConnectionMove`** — every mousemove while a drag is in
 *      progress, projects the pointer and updates `currentPoint`.
 *   5. **`handleConnectionEnd`** — the heavy validator. Finds the SMALLEST
 *      containing node at the drop position (rf-canv-6 inline holdout —
 *      kept inline because no predicate filters anything; folding through
 *      `findSmallestContainerHit(... , () => true, ...)` would bury the
 *      no-predicate semantics). Then runs the validation cascade verbatim:
 *      `canConnect` → `findExistingSpecialConnection` (one Source.Repository
 *      / one Config.Environment per service) → `validateConnection`
 *      (anti-patterns / duplicates) → `wouldCreateCycle` (warning only,
 *      cycles aren't blocked). On success: infers connection metadata via
 *      `inferConnectionMeta`, normalizes direction (`flip` swaps source/
 *      target so EnvVars → Service becomes Service → EnvVars), threads any
 *      `sourceRouteId` from a Network.CustomDomain row port through to the
 *      edge data, and dispatches `addEdgeToCard`. ALWAYS clears the drag
 *      state via `setDrawingConnection(null)` — every exit path.
 *
 * Per blueprint **risk #3** the dep array of `handleConnectionEnd` keeps
 * `card` verbatim — DO NOT switch to a ref. The handler reads the latest
 * Redux card edges through `card.edges` for the special-rule conflict
 * lookup + `validateConnection`'s duplicate-detection input + `wouldCreateCycle`'s
 * existing-edges argument, and a stale ref would let "drew an edge, then
 * drew another in the same render cycle" double-create or skip the
 * conflict gate.
 *
 * Per blueprint **risk #5** the orchestrator's onMouseDown gate continues
 * to own the `target.classList.contains('connection-port')` event-target
 * sniff. This hook also re-checks the same predicate at the top of
 * `handleConnectionPortDown` (verbatim from the inline body), so calling
 * `handleConnectionPortDown` against an event whose target is NOT a port
 * is a no-op — but the orchestrator's gate is what routes the event
 * between port-drag (calls `handleConnectionPortDown`) and pan-canvas
 * (delegates to `bindCanvas.onMouseDown`). Removing the orchestrator's
 * gate would make every empty-canvas mousedown fall through to
 * `handleConnectionPortDown` first, which is fine semantically (the body
 * short-circuits) but breaks the pan-canvas affordance. Keep both.
 *
 * The orchestrator threads in:
 *   - `effectiveNodes` (the visible-and-folded canvas nodes — used for the
 *     drop-target hit-test, the validation cascade, and the
 *     `connectionDragTargets` walk),
 *   - `card` (the active Redux card — its `edges` feed all four validation
 *     gates; `null` when no card is active, in which case the special-rule
 *     gate is skipped per the original inline `if (sourceNode && card)`),
 *   - `screenToCanvas` (from `useCanvasInteractions` — projects mouse
 *     events to canvas-space coordinates).
 *
 * `dispatch` is sourced internally via `useDispatch` — the orchestrator
 * doesn't need to thread it.
 *
 * rf-canv-27 (RISK #3, RISK #5).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addEdgeToCard, type Card, type CardEdge } from '../../../store/slices/cards-slice';
import { findExistingLogSource, findExistingSpecialConnection } from '../utils/connection-special-rules';
import { buildRejectionMessage } from '../utils/connection-rejection';
import { t } from '../../../i18n';
import {
  inferConnectionMeta,
  validateConnection,
  wouldCreateCycle,
  canConnect,
  CATEGORY_TO_RELATIONSHIP,
} from '../utils/connection-rules';
import type { AppDispatch } from '../../../store';
import type { CanvasNode } from '../components/types';
import type { ConnectionRejection } from '../components/connection-rejection-overlay';

/** Drag descriptor stored in state while a port drag is in progress. */
export interface DrawingConnectionState {
  sourceId: string;
  /** Route id when the drag started from a Network.CustomDomain row port. */
  sourceRouteId?: string;
  sourcePoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
}

export interface UseConnectionDrawingArgs {
  /** Visible-and-folded canvas nodes; fed into hit-tests + canConnect. */
  effectiveNodes: CanvasNode[];
  /** Active Redux card or null — `card.edges` drives the validation cascade. */
  card: Card | undefined;
  /** Convert a screen-space coordinate to canvas-space (from `useCanvasInteractions`). */
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
}

export interface UseConnectionDrawingResult {
  /** In-flight drag descriptor, or null when no port-drag is active. */
  drawingConnection: DrawingConnectionState | null;
  /**
   * Per-node target classification while a drag is in progress, or null
   * when no drag is active. Source node is keyed `'source'`; every other
   * node is `'valid-target' | 'invalid-target'` based on `canConnect`.
   */
  connectionDragTargets: Map<string, 'valid-target' | 'invalid-target' | 'source'> | null;
  /**
   * Floating rejection tooltip — set when a drop is rejected, cleared
   * after `REJECTION_TIMEOUT_MS` or when a new drag starts. The canvas
   * renders it as a sibling of the connection preview overlay.
   */
  rejection: ConnectionRejection | null;
  /**
   * onMouseDown handler for connection-port drags. The orchestrator
   * pre-gates this on `target.classList.contains('connection-port')`
   * (RISK #5); the handler also re-checks the predicate verbatim and
   * no-ops if it doesn't match.
   */
  handleConnectionPortDown: (e: React.MouseEvent) => void;
  /** onMouseMove handler — updates `currentPoint` while a drag is in progress. */
  handleConnectionMove: (e: React.MouseEvent) => void;
  /**
   * onMouseUp handler — runs the validation cascade against the smallest
   * containing node at the drop point and dispatches `addEdgeToCard` on
   * success. Always clears the drag state on every exit path.
   */
  handleConnectionEnd: (e: React.MouseEvent) => void;
}

/** How long the rejection tooltip stays on-screen after a failed drop. */
const REJECTION_TIMEOUT_MS = 2500;

export function useConnectionDrawing(args: UseConnectionDrawingArgs): UseConnectionDrawingResult {
  const { effectiveNodes, card, screenToCanvas } = args;
  const dispatch = useDispatch<AppDispatch>();

  const [drawingConnection, setDrawingConnection] = useState<DrawingConnectionState | null>(null);
  const [rejection, setRejection] = useState<ConnectionRejection | null>(null);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRejectionTimer = useCallback(() => {
    if (rejectionTimerRef.current !== null) {
      clearTimeout(rejectionTimerRef.current);
      rejectionTimerRef.current = null;
    }
  }, []);

  const showRejection = useCallback(
    (next: ConnectionRejection) => {
      clearRejectionTimer();
      setRejection(next);
      rejectionTimerRef.current = setTimeout(() => {
        setRejection(null);
        rejectionTimerRef.current = null;
      }, REJECTION_TIMEOUT_MS);
    },
    [clearRejectionTimer],
  );

  useEffect(() => () => clearRejectionTimer(), [clearRejectionTimer]);

  /** Compute valid/invalid target states for all nodes during connection drag */
  const connectionDragTargets = useMemo(() => {
    if (!drawingConnection) return null;
    const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
    if (!sourceNode) return null;
    const srcIceType = (sourceNode.data?.iceType as string) || '';
    const srcNodeType = sourceNode.type;

    const targets = new Map<string, 'valid-target' | 'invalid-target' | 'source'>();
    targets.set(drawingConnection.sourceId, 'source');

    for (const node of effectiveNodes) {
      if (node.id === drawingConnection.sourceId) continue;
      const tgtIceType = (node.data?.iceType as string) || '';
      const isValid = canConnect(srcIceType, tgtIceType, srcNodeType, node.type, {
        srcNode: sourceNode,
        tgtNode: node,
        allNodes: effectiveNodes,
      });
      targets.set(node.id, isValid ? 'valid-target' : 'invalid-target');
    }
    return targets;
  }, [drawingConnection, effectiveNodes]);

  /** Start drawing a connection from a port */
  const handleConnectionPortDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement;
      if (!target.classList.contains('connection-port')) return;

      e.stopPropagation();
      e.preventDefault();

      const nodeId = target.getAttribute('data-node-id');
      if (!nodeId) return;

      // Network.CustomDomain ports carry `data-route-id` so we know
      // which route slot this drag started from. Other nodes don't set
      // this attribute, in which case sourceRouteId stays undefined and
      // the resulting edge gets no routeId.
      const routeId = target.getAttribute('data-route-id') || undefined;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      // A fresh drag invalidates any prior rejection tooltip — drop it
      // immediately so the new gesture isn't visually overlapped by the
      // last failure.
      clearRejectionTimer();
      setRejection(null);

      setDrawingConnection({
        sourceId: nodeId,
        sourceRouteId: routeId,
        sourcePoint: canvasPos,
        currentPoint: canvasPos,
      });
    },
    [screenToCanvas, clearRejectionTimer],
  );

  /** Track mouse during connection drawing */
  const handleConnectionMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrawingConnection((prev) => (prev ? { ...prev, currentPoint: canvasPos } : null));
    },
    [drawingConnection, screenToCanvas],
  );

  /** Complete connection drawing — find target node, create edge, show popover */
  const handleConnectionEnd = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      // Find node at drop position (excluding source).
      //
      // Pick the SMALLEST containing node, not the first hit. The
      // canvas allows nesting (Container inside Subnet inside VPC), and
      // the drop position can be inside multiple stacked rectangles.
      // First-hit-wins fails when the parent group happens to be later
      // in the node array than its children — which is order-dependent
      // on how the user dragged things around. The smallest area is
      // always the most-specific (deepest) target, which is what the
      // user means by "drop on this block."
      //
      // NOTE (rf-canv-6): kept inline because no predicate filters anything
      // here — connection drops target ANY node, not just containers. Folding
      // through `findSmallestContainerHit(... , () => true, ...)` would bury
      // the no-predicate semantics. Flagged for follow-up consolidation.
      let targetNode: CanvasNode | null = null;
      let targetArea = Number.POSITIVE_INFINITY;
      for (const node of effectiveNodes) {
        if (node.id === drawingConnection.sourceId) continue;
        if (
          canvasPos.x >= node.x &&
          canvasPos.x <= node.x + node.width &&
          canvasPos.y >= node.y &&
          canvasPos.y <= node.y + node.height
        ) {
          const area = node.width * node.height;
          if (area < targetArea) {
            targetNode = node;
            targetArea = area;
          }
        }
      }

      if (targetNode) {
        const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
        const srcIceTypeCheck = (sourceNode?.data?.iceType as string) || '';
        const tgtIceTypeCheck = (targetNode.data?.iceType as string) || '';

        // ── Block invalid connections based on CONNECTION_RULES ──
        if (
          !canConnect(srcIceTypeCheck, tgtIceTypeCheck, sourceNode?.type, targetNode.type, {
            srcNode: sourceNode,
            tgtNode: targetNode,
            allNodes: effectiveNodes,
          })
        ) {
          showRejection({
            x: canvasPos.x,
            y: canvasPos.y,
            message: buildRejectionMessage(srcIceTypeCheck, tgtIceTypeCheck, { kind: 'no-rule' }),
          });
          setDrawingConnection(null);
          return;
        }

        // ── Connection constraints: one Source and one EnvVars per service ──
        if (sourceNode && card) {
          const { specialType, conflict } = findExistingSpecialConnection(
            sourceNode,
            targetNode,
            card.edges as CardEdge[],
            effectiveNodes,
          );
          if (specialType && conflict) {
            const label =
              specialType === 'source'
                ? t('canvas.rejection.githubRepoLabel')
                : t('canvas.rejection.envVarsLabel');
            // Keep the console.warn alongside showRejection — devs
            // inspecting the console still see what was rejected; users
            // see the inline tooltip near the cursor.
            console.warn(`[Canvas] Only one ${label} block can be connected to a service`);
            showRejection({
              x: canvasPos.x,
              y: canvasPos.y,
              message: buildRejectionMessage(srcIceTypeCheck, tgtIceTypeCheck, {
                kind: 'special-conflict',
                label,
              }),
            });
            setDrawingConnection(null);
            return;
          }

          // ── Log terminal cardinality: one source per terminal ──
          // A log block streams a single Cloud Logging sink — wiring a
          // second source would scramble timestamps, so block the drag
          // and tell the user to drop another Log block instead.
          const { conflict: logConflict } = findExistingLogSource(
            sourceNode,
            targetNode,
            card.edges as CardEdge[],
          );
          if (logConflict) {
            const message = t('canvas.rejection.logHasSource');
            console.warn(`[Canvas] ${message}`);
            showRejection({
              x: canvasPos.x,
              y: canvasPos.y,
              message: buildRejectionMessage(srcIceTypeCheck, tgtIceTypeCheck, {
                kind: 'validation-error',
                message,
              }),
            });
            setDrawingConnection(null);
            return;
          }
        }

        // ── Smart connection: auto-detect type, validate, and create ──
        const srcIceType = (sourceNode?.data?.iceType as string) || '';
        const tgtIceType = (targetNode.data?.iceType as string) || '';
        const cardEdgesArr = (card?.edges || []) as CardEdge[];

        // Validate — check for anti-patterns and duplicates
        const warnings = validateConnection(
          srcIceType,
          tgtIceType,
          cardEdgesArr.map((e) => ({ source: e.source, target: e.target })),
          drawingConnection.sourceId,
          targetNode.id,
          sourceNode?.type,
          targetNode.type,
        );

        // Block hard errors (self-connection)
        if (warnings.some((w) => w.level === 'error')) {
          const errorMessage = warnings
            .filter((w) => w.level === 'error')
            .map((w) => w.message)
            .join('; ');
          console.warn('[Canvas] Connection blocked:', errorMessage);
          showRejection({
            x: canvasPos.x,
            y: canvasPos.y,
            message: buildRejectionMessage(srcIceType, tgtIceType, {
              kind: 'validation-error',
              message: errorMessage,
            }),
          });
          setDrawingConnection(null);
          return;
        }

        // Circular dependency check
        if (
          wouldCreateCycle(
            drawingConnection.sourceId,
            targetNode.id,
            cardEdgesArr.map((e) => ({ source: e.source, target: e.target })),
          )
        ) {
          console.warn('[Canvas] Connection would create a circular dependency');
          // Still allow it — just log the warning (cycles aren't always wrong)
        }

        // Log soft warnings (user sees them as console hints for now)
        for (const w of warnings.filter((w) => w.level === 'warning')) {
          console.warn(`[Canvas] ${w.message}${w.suggestion ? ` — ${w.suggestion}` : ''}`);
        }

        // Infer connection metadata from block types
        const meta = inferConnectionMeta(srcIceType, tgtIceType);

        // Normalize direction — flip source/target when semantically wrong
        // e.g. EnvVars → Service becomes Service → EnvVars (service depends_on envvars)
        const edgeSource = meta.flip ? targetNode.id : drawingConnection.sourceId;
        const edgeTarget = meta.flip ? drawingConnection.sourceId : targetNode.id;

        // When the drag started from a Network.CustomDomain row port,
        // the edge carries the source route id so the translator + the
        // target's properties panel can resolve the subdomain. The
        // direction never flips here (CustomDomain → service is the
        // canonical orientation per the connection rules).
        const sourceRouteId = drawingConnection.sourceRouteId;

        const edgeId = `edge-${Date.now()}`;
        const newEdge: CardEdge = {
          id: edgeId,
          source: edgeSource,
          target: edgeTarget,
          data: {
            relationship: CATEGORY_TO_RELATIONSHIP[meta.category],
            connectionCategory: meta.category,
            ...(meta.trafficType && { trafficType: meta.trafficType }),
            ...(meta.port && { port: meta.port }),
            ...(meta.envVarName && { envVarName: meta.envVarName }),
            ...(meta.lineStyle !== 'solid' && { lineStyle: meta.lineStyle }),
            ...(meta.color && { color: meta.color }),
            ...(sourceRouteId && { routeId: sourceRouteId }),
          },
        };
        dispatch(addEdgeToCard(newEdge));

        // All property propagation (repo sync, domain sync, secrets, env vars,
        // network policy) is handled reactively by useComputingFlows() — no
        // one-shot logic needed here. The hook picks up the new edge on the
        // next render and applies all matching PROPAGATION_RULES.

        // Connection is fully auto-configured — no popover needed
      }

      setDrawingConnection(null);
    },
    // RISK #3 — `card` STAYS in the dep array (do not switch to a ref).
    // The handler reads `card.edges` through three validation gates and a
    // stale ref would let consecutive drops in the same render cycle
    // either double-create the same special-rule edge or miss a cycle.
    [drawingConnection, screenToCanvas, effectiveNodes, card, dispatch, showRejection],
  );

  return {
    drawingConnection,
    connectionDragTargets,
    rejection,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
  };
}
