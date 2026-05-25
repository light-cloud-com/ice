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

import {
  chooseBestTargetPort,
  findMatchingPorts,
  findPort,
  getBlockKind,
  getPortsForNode,
  ROLE_CATEGORY,
  type PortDef,
} from '@ice/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { t } from '../../../i18n';
import { addEdgeToCard, type Card, type CardEdge } from '../../../store/slices/cards-slice';
import { getSocketCanvasPosition } from '../components/path/socket-position';
import { buildRejectionMessage } from '../utils/connection-rejection';
import {
  inferConnectionMeta,
  validateConnection,
  wouldCreateCycle,
  canConnect,
  CATEGORY_TO_RELATIONSHIP,
} from '../utils/connection-rules';
import { findExistingLogSource, findExistingSpecialConnection } from '../utils/connection-special-rules';
import type { AppDispatch } from '../../../store';
import type { ConnectionRejection } from '../components/connection-rejection-overlay';
import type { ConnectionDragInfo } from '../components/nodes/_shared/connection-drag-context';
import type { CanvasNode } from '../components/types';

/** Drag descriptor stored in state while a port drag is in progress. */
export interface DrawingConnectionState {
  sourceId: string;
  /** Route id when the drag started from a Network.CustomDomain row port. */
  sourceRouteId?: string;
  /** Typed-socket id when the drag started from a typed socket dot. */
  sourceSocketId?: string;
  sourcePoint: { x: number; y: number };
  /**
   * Visible wire endpoint — equals `cursorPoint` when nothing is in
   * snap range, otherwise the snapped port's position so the line
   * visually locks on.
   */
  currentPoint: { x: number; y: number };
  /**
   * Real cursor position in canvas-space. Tracked separately from
   * `currentPoint` so the snap search runs against where the user
   * actually is — not where the wire is parked. Without this split the
   * snap is sticky: once a port wins, `currentPoint` becomes that
   * port's position, distance-to-self is 0, and no neighbour can
   * displace it even when the cursor has drifted closer. Invisible
   * for widely spaced sockets, fatal for Custom Domain rows ~40px apart.
   */
  cursorPoint: { x: number; y: number };
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
   * Per-port compatibility info + snap-target for the active drag.
   * Consumed by `ConnectionDragProvider` so TypedSockets can highlight
   * matching ports across the canvas and snap the wire endpoint. Null
   * while no drag is active.
   */
  connectionDragInfo: ConnectionDragInfo | null;
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

/** Cursor-to-port distance (canvas-space px) within which the wire snaps to the port. */
const SNAP_RADIUS = 60;

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

  /**
   * Per-port compatibility map for the active drag — for every node,
   * the set of port ids whose role accepts the dragged source port.
   * Also stores the canvas-space position of each compatible port so the
   * magnetic snap calculation in `handleConnectionMove` doesn't have to
   * re-walk the schemas every frame.
   */
  const dragCompatibility = useMemo<{
    sourcePort: PortDef | undefined;
    compatibleByNode: Map<string, Set<string>>;
    positions: Map<string, { nodeId: string; portId: string; x: number; y: number }>;
  } | null>(() => {
    if (!drawingConnection || !drawingConnection.sourceSocketId) return null;
    const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
    if (!sourceNode) return null;
    const sourcePort = findPort(
      { id: sourceNode.id, type: sourceNode.type, data: sourceNode.data },
      drawingConnection.sourceSocketId,
    );
    if (!sourcePort) return null;

    const srcKind = getBlockKind((sourceNode.data?.iceType as string) || '');
    const compatibleByNode = new Map<string, Set<string>>();
    const positions = new Map<string, { nodeId: string; portId: string; x: number; y: number }>();
    for (const node of effectiveNodes) {
      if (node.id === drawingConnection.sourceId) continue;
      const ports = getPortsForNode({ id: node.id, type: node.type, data: node.data });
      if (ports.length === 0) continue;
      const tgtKind = getBlockKind((node.data?.iceType as string) || '');
      const matching = findMatchingPorts(sourcePort, ports, srcKind, tgtKind);
      if (matching.length === 0) continue;
      const ids = new Set<string>();
      for (const port of matching) {
        ids.add(port.id);
        // `getSocketCanvasPosition` honours bespoke renderer overrides
        // (e.g. Network.CustomDomain's per-row Y) so the snap target
        // matches the visible dot pixel-for-pixel. Using the raw
        // `getPortAnchorPoint` here drifts on multi-row blocks because
        // the schema's side-distribution math doesn't predict where the
        // hand-laid-out renderer actually draws the dot.
        const pt = getSocketCanvasPosition(node, port.id);
        if (!pt) continue;
        positions.set(`${node.id}::${port.id}`, { nodeId: node.id, portId: port.id, x: pt.x, y: pt.y });
      }
      compatibleByNode.set(node.id, ids);
    }
    return { sourcePort, compatibleByNode, positions };
  }, [drawingConnection, effectiveNodes]);

  /**
   * Magnetic snap target — the compatible port closest to the cursor
   * within `SNAP_RADIUS`. Drives both the wire-endpoint pull (in
   * `handleConnectionMove`) and the snapped-port glow (via the drag
   * context). Recomputed cheaply on every `cursorPoint` change.
   *
   * MUST use `cursorPoint`, not `currentPoint`. `currentPoint` is the
   * already-snapped endpoint, so using it would keep distance-to-self
   * at 0 and lock the snap onto the first port that ever won — fatal
   * for closely-spaced sockets (e.g. Custom Domain rows).
   */
  const snap = useMemo<{ nodeId: string; portId: string; x: number; y: number } | null>(() => {
    if (!drawingConnection || !dragCompatibility) return null;
    const { x: cx, y: cy } = drawingConnection.cursorPoint;
    let best: { nodeId: string; portId: string; x: number; y: number; d: number } | null = null;
    for (const p of dragCompatibility.positions.values()) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > SNAP_RADIUS) continue;
      if (!best || d < best.d) best = { nodeId: p.nodeId, portId: p.portId, x: p.x, y: p.y, d };
    }
    return best ? { nodeId: best.nodeId, portId: best.portId, x: best.x, y: best.y } : null;
  }, [drawingConnection, dragCompatibility]);

  const connectionDragInfo: ConnectionDragInfo | null = useMemo(() => {
    if (!drawingConnection) return null;
    return {
      sourceNodeId: drawingConnection.sourceId,
      sourcePortId: drawingConnection.sourceSocketId,
      compatibleByNode: dragCompatibility?.compatibleByNode ?? new Map(),
      snap: snap ? { nodeId: snap.nodeId, portId: snap.portId } : null,
    };
  }, [drawingConnection, dragCompatibility, snap]);

  /** Compute valid/invalid target states for all nodes during connection drag */
  const connectionDragTargets = useMemo(() => {
    if (!drawingConnection) return null;
    const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
    if (!sourceNode) return null;
    const srcIceType = (sourceNode.data?.iceType as string) || '';
    const srcNodeType = sourceNode.type;

    // If the drag started from a typed port, resolve it so we can do
    // role matching per target. A drag from the block body (no port id)
    // skips role matching and falls back to category-level canConnect.
    const sourcePort: PortDef | undefined = drawingConnection.sourceSocketId
      ? findPort({ id: sourceNode.id, type: sourceNode.type, data: sourceNode.data }, drawingConnection.sourceSocketId)
      : undefined;

    const targets = new Map<string, 'valid-target' | 'invalid-target' | 'source'>();
    targets.set(drawingConnection.sourceId, 'source');

    const srcKindForTargets = getBlockKind(srcIceType);

    for (const node of effectiveNodes) {
      if (node.id === drawingConnection.sourceId) continue;
      const tgtIceType = (node.data?.iceType as string) || '';
      // When a typed source port is in play, role + peer-kind matching
      // is the authoritative gate. The 4-category `canConnect` carries
      // legacy contextual rules (e.g. "top-level Custom Domain can't
      // route into a VPC") that pre-date the typed-socket model and
      // sometimes block legitimate wirings the user explicitly drew
      // socket-to-socket. Trusting role-matching here keeps the
      // user's drag deterministic.
      if (sourcePort) {
        const tgtPorts = getPortsForNode({ id: node.id, type: node.type, data: node.data });
        const tgtKind = getBlockKind(tgtIceType);
        const matching = findMatchingPorts(sourcePort, tgtPorts, srcKindForTargets, tgtKind);
        targets.set(node.id, matching.length > 0 ? 'valid-target' : 'invalid-target');
        continue;
      }
      // Legacy body drag (no typed source port) — fall back to the
      // category-level legality gate so blind drops still respect the
      // old rules.
      const categoryAllowed = canConnect(srcIceType, tgtIceType, srcNodeType, node.type, {
        srcNode: sourceNode,
        tgtNode: node,
        allNodes: effectiveNodes,
      });
      targets.set(node.id, categoryAllowed ? 'valid-target' : 'invalid-target');
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

      // Typed-socket ports carry `data-socket-id`. Empty string means
      // an LOD-degraded fallback dot (no specific socket bound) — leave
      // sourceSocketId undefined in that case so the edge writes no
      // socket id and the renderer falls back to chooseSides.
      const socketIdAttr = target.getAttribute('data-socket-id') || '';
      const sourceSocketId = socketIdAttr.length > 0 ? socketIdAttr : undefined;

      const cursorPos = screenToCanvas(e.clientX, e.clientY);

      // Anchor the wire's visible start at the actual socket dot — not
      // the cursor's click position. Read the dot's center from the DOM
      // via `getBoundingClientRect()` and project to canvas-space.
      //
      // Reading from the DOM (not the port schema) is what lets us
      // support bespoke renderers like Custom Domain, whose per-route
      // row ports live at hand-computed Y coordinates that the
      // schema's standard side-distribution math doesn't predict. Any
      // socket dot the user CLICKED has a real DOM rect — that's the
      // source of truth, period.
      let sourcePoint = cursorPos;
      // `getBoundingClientRect` may be missing under test mocks — guard with typeof.
      const dotRect = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
      if (dotRect && dotRect.width > 0 && dotRect.height > 0) {
        sourcePoint = screenToCanvas(dotRect.left + dotRect.width / 2, dotRect.top + dotRect.height / 2);
      } else if (sourceSocketId) {
        // Fallback when the element has no measured rect (rare — e.g.
        // off-screen). Route through `getSocketCanvasPosition` so
        // bespoke renderers (Custom Domain row ports) anchor to their
        // hand-laid-out Y instead of the schema's side-distribution.
        const node = effectiveNodes.find((n) => n.id === nodeId);
        if (node) {
          const pt = getSocketCanvasPosition(node, sourceSocketId);
          if (pt) sourcePoint = pt;
        }
      }

      // A fresh drag invalidates any prior rejection tooltip — drop it
      // immediately so the new gesture isn't visually overlapped by the
      // last failure.
      clearRejectionTimer();
      setRejection(null);

      setDrawingConnection({
        sourceId: nodeId,
        sourceRouteId: routeId,
        sourceSocketId,
        sourcePoint,
        currentPoint: cursorPos,
        cursorPoint: cursorPos,
      });
    },
    [screenToCanvas, clearRejectionTimer, effectiveNodes],
  );

  // Magnet-snap reference — the snap target derived from the latest
  // `currentPoint`. Kept as a ref so `handleConnectionMove` can magnet
  // the visible cursor toward the snap point without re-rendering twice.
  const snapRef = useRef(snap);
  snapRef.current = snap;

  /** Track mouse during connection drawing — magnets to compatible ports within SNAP_RADIUS. */
  const handleConnectionMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      // `cursorPoint` is the source of truth for the snap search (the
      // `snap` useMemo reads it). `currentPoint` is the visible wire
      // endpoint — equal to the cursor unless a snap target pulls it
      // onto a compatible port. We re-read the snap through the ref
      // because it's derived from the previous render's cursorPoint.
      setDrawingConnection((prev) => {
        if (!prev) return null;
        const snapped = snapRef.current;
        const dx = snapped ? snapped.x - canvasPos.x : 0;
        const dy = snapped ? snapped.y - canvasPos.y : 0;
        const distance = snapped ? Math.sqrt(dx * dx + dy * dy) : Infinity;
        const endpoint = snapped && distance <= SNAP_RADIUS ? { x: snapped.x, y: snapped.y } : canvasPos;
        return { ...prev, cursorPoint: canvasPos, currentPoint: endpoint };
      });
    },
    [drawingConnection, screenToCanvas],
  );

  /** Complete connection drawing — find target node, create edge, show popover */
  const handleConnectionEnd = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingConnection) return;

      const canvasPos = screenToCanvas(e.clientX, e.clientY);

      // ── Target node lookup ─────────────────────────────────────────
      //
      // When the magnet has snapped the wire endpoint onto a compatible
      // port, that node IS the target. The user saw a green snapped
      // halo on a specific dot — that's the promise; release here =
      // wire goes there, regardless of whether the cursor itself
      // strayed a few pixels outside the block's bounds.
      //
      // Without a snap (legacy body drop), fall back to the
      // smallest-containing-node heuristic so nested layouts still
      // pick the deepest (most-specific) target. First-hit-wins
      // would lose to ordering.
      let targetNode: CanvasNode | null = null;
      const snappedTarget = snapRef.current;
      if (snappedTarget) {
        targetNode = effectiveNodes.find((n) => n.id === snappedTarget.nodeId) ?? null;
      }
      if (!targetNode) {
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
      }

      if (targetNode) {
        const sourceNode = effectiveNodes.find((n) => n.id === drawingConnection.sourceId);
        const srcIceTypeCheck = (sourceNode?.data?.iceType as string) || '';
        const tgtIceTypeCheck = (targetNode.data?.iceType as string) || '';

        // ── Role gate: if the drag started from a typed port and the
        //    target has no matching IN port, silently cancel — the
        //    drag-context already dimmed every incompatible block so
        //    the user knew. No tooltip for this case (verbosity that
        //    repeats the visual cue).
        //
        //    When role-matching DOES find a pair, that's authoritative —
        //    we skip the legacy `canConnect` cascade below. Otherwise
        //    its contextual rules (e.g. top-level Custom Domain → VPC
        //    blocked) reject legitimate socket-to-socket wires the user
        //    explicitly drew.
        let typedRoleGatePassed = false;
        if (drawingConnection.sourceSocketId && sourceNode) {
          const srcPort = findPort(
            { id: sourceNode.id, type: sourceNode.type, data: sourceNode.data },
            drawingConnection.sourceSocketId,
          );
          if (srcPort) {
            const tgtPorts = getPortsForNode({ id: targetNode.id, type: targetNode.type, data: targetNode.data });
            const srcKind = getBlockKind(srcIceTypeCheck);
            const tgtKind = getBlockKind(tgtIceTypeCheck);
            const matching = findMatchingPorts(srcPort, tgtPorts, srcKind, tgtKind);
            if (matching.length === 0) {
              setDrawingConnection(null);
              return;
            }
            typedRoleGatePassed = true;
          }
        }

        // ── Block invalid connections based on CONNECTION_RULES ──
        //    Only fires for legacy body drops (no typed source port).
        //    Typed-socket drops trust the role gate above.
        if (
          !typedRoleGatePassed &&
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
              specialType === 'source' ? t('canvas.rejection.githubRepoLabel') : t('canvas.rejection.envVarsLabel');
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
          const { conflict: logConflict } = findExistingLogSource(sourceNode, targetNode, card.edges as CardEdge[]);
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

        // Persist typed socket ids on the edge so the renderer can pick
        // the right magnetic anchor side and detect dangling edges when
        // a property change removes the socket later. If the drag
        // started from a generic block-body click (no `data-socket-id`),
        // pick the best socket on the source matching the inferred
        // category + outgoing direction; same for the target picking an
        // incoming socket. When no match exists, leave the field undefined
        // and the renderer falls back to chooseSides.
        const sourceForSocketLookup = meta.flip ? targetNode : sourceNode;
        const targetForSocketLookup = meta.flip ? sourceNode : targetNode;
        const draggedSocketId = drawingConnection.sourceSocketId;

        function pickByCategory(
          n: CanvasNode | undefined,
          direction: 'in' | 'out',
          category: typeof meta.category,
        ): string | undefined {
          if (!n) return undefined;
          const list = getPortsForNode({ id: n.id, type: n.type, data: n.data });
          return list.find((p) => p.direction === direction && ROLE_CATEGORY[p.role] === category)?.id;
        }

        // When we know the dragged port, the partner's best socket is
        // the one matching its role — not just any port of the right
        // category. This is what makes the wire deterministic.
        const draggedPort: PortDef | undefined =
          draggedSocketId && sourceNode
            ? findPort({ id: sourceNode.id, type: sourceNode.type, data: sourceNode.data }, draggedSocketId)
            : undefined;

        let pickedPartner: string | undefined;
        // Magnet snap: when the user released within snap radius of a
        // compatible port, that port wins over the chooseBestTargetPort
        // fallback — the visible snap glow already promised it.
        const activeSnap = snapRef.current;
        if (activeSnap && activeSnap.nodeId === targetNode.id) {
          pickedPartner = activeSnap.portId;
        } else if (draggedPort && targetNode && sourceNode) {
          const partnerPorts = getPortsForNode({
            id: targetNode.id,
            type: targetNode.type,
            data: targetNode.data,
          });
          const srcKind = getBlockKind((sourceNode.data?.iceType as string) || '');
          const tgtKind = getBlockKind((targetNode.data?.iceType as string) || '');
          pickedPartner = chooseBestTargetPort(draggedPort, partnerPorts, srcKind, tgtKind)?.id;
        }

        const sourceSocketResolved =
          (!meta.flip && draggedSocketId) ||
          (meta.flip ? pickedPartner : undefined) ||
          pickByCategory(sourceForSocketLookup, 'out', meta.category);
        const targetSocketResolved =
          (meta.flip && draggedSocketId) ||
          (!meta.flip ? pickedPartner : undefined) ||
          pickByCategory(targetForSocketLookup, 'in', meta.category);

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
            ...(sourceSocketResolved && { sourceSocket: sourceSocketResolved }),
            ...(targetSocketResolved && { targetSocket: targetSocketResolved }),
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
    connectionDragInfo,
    rejection,
    handleConnectionPortDown,
    handleConnectionMove,
    handleConnectionEnd,
  };
}
