/**
 * useCanvasDrop
 *
 * Owns the palette → canvas drop machinery the orchestrator
 * (`svg-canvas.tsx`) used to run inline:
 *
 *   1. `handleDragOver` — the surface-level `event.preventDefault()` +
 *      `dataTransfer.dropEffect = 'move'`. Without it the browser refuses
 *      to fire `drop`, so it has to live alongside `handleDrop` even
 *      though it owns no state.
 *   2. `handleDrop` — the palette-drop dispatcher. Reads the dragged
 *      payload off `event.dataTransfer`, computes the canvas position via
 *      the orchestrator-supplied `screenToCanvas`, and locates the
 *      drop's parent container (if any) via `findContainerAtPosition`.
 *      Three drop branches are dispatched verbatim from the
 *      pre-rf-canv-24 inline form:
 *
 *        - **Group drop** (`application/ice-group`) — creates an empty
 *          `Group.${groupType}` container at the cursor with default
 *          400x300 size, label/`groupColor` overrides off
 *          `application/ice-group-name` / `application/ice-group-color`,
 *          and dispatches `addNodeToCard`. NEVER parented (groups are
 *          top-level visual containers).
 *        - **Block drop** (`application/ice-block`) — looks up the
 *          blueprint via `getBlueprint(blockType, provider)`. If the
 *          blueprint resolves: `expandBlueprint(...)` with
 *          `parentContainerId` only when `canContain` allows it, merges
 *          any `application/ice-block-data` JSON via `Object.assign`
 *          (silently swallows malformed JSON), dispatches
 *          `expandBlueprintToCard`, and publishes ghost suggestions via
 *          `setGhosts(generateGhostSuggestions(...))`. If the blueprint
 *          does NOT resolve, falls through to the resource branch.
 *        - **Resource drop** (`application/ice-resource` or block-fallthrough)
 *          — creates a single `resource` node with size from
 *          `computeCompactNodeWidth/Height`, optionally parents to the
 *          target container if `canContain` allows, dispatches
 *          `addNodeToCard`, and publishes ghost suggestions.
 *
 * Behavior is preserved verbatim from the pre-rf-canv-24 inline form,
 * including:
 *   - The empty-payload (`!groupType && !blockType && !resourceType`)
 *     short-circuit returns BEFORE `screenToCanvas` is called.
 *   - The `canContain` validation gates `parentId` ONLY — it does NOT
 *     prevent the drop. An invalid drop still creates the node at the
 *     cursor with no parent.
 *   - The malformed-JSON `try/catch` for the block-data overrides
 *     silently ignores the error (no log, no toast). Existing data on
 *     `expanded.node.data` is left untouched.
 *   - `logDrop` fires unconditionally on every drop (after the empty-
 *     payload guard) with `{ position, targetContainer, nodeType }`.
 *   - `logBlueprint` fires ONLY on the block-drop-with-blueprint path.
 *   - The id formats (`group-${Date.now()}`, `node-${Date.now()}`).
 *   - The default group color `#3b82f6` and label `'New Group'`.
 *   - The `iceType: 'Resource.Unknown'` fallback when no `resourceType`
 *     was supplied.
 *
 * The orchestrator threads in:
 *   - `screenToCanvas` (from `useCanvasInteractions`),
 *   - `findContainerAtPosition` (the orchestrator's bound wrapper around
 *     the rf-canv-6 `findContainerAtPosition` util),
 *   - `nodes` and `edges` (from the active card).
 *
 * rf-canv-24.
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isIceTypeEnabledForProvider } from '@ice/constants';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { canContain } from '../../../config/containment-rules';
import {
  addNodeToCard,
  expandBlueprintToCard,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { setGhosts } from '../../../store/slices/ghost-slice';
import { generateGhostSuggestions } from '../utils/ghost-suggestions';
import { computeCompactNodeHeight, computeCompactNodeWidth } from '../components/nodes/compact-node';
import { logDrop, logBlueprint } from '../../../shared/utils/debug-logger';
import type { AppDispatch, RootState } from '../../../store';
import type { CanvasNode } from '../components/types';

export interface UseCanvasDropArgs {
  /** Convert a screen-space coordinate to canvas-space (from `useCanvasInteractions`). */
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  /**
   * Locate the container under (x, y) in canvas-space — typically the
   * orchestrator's `findContainerAtPosition` callback bound around the
   * rf-canv-6 util. Returns `null` when the cursor is over empty canvas.
   */
  findContainerAtPosition: (x: number, y: number) => CanvasNode | null;
  /** All Redux nodes on the active card — fed into ghost-suggestion generation. */
  nodes: CardNode[];
  /** All Redux edges on the active card — fed into ghost-suggestion generation. */
  edges: CardEdge[];
}

export interface UseCanvasDropResult {
  /** `onDrop` handler: dispatches the palette drop into the active card. */
  handleDrop: (event: React.DragEvent) => void;
  /** `onDragOver` handler: enables the `drop` event by preventing default. */
  handleDragOver: (event: React.DragEvent) => void;
}

export function useCanvasDrop(args: UseCanvasDropArgs): UseCanvasDropResult {
  const { screenToCanvas, findContainerAtPosition, nodes, edges } = args;
  const dispatch = useDispatch<AppDispatch>();
  const deployProvider = useSelector((s: RootState) => s.deploy.provider);

  // Handle drop from palette
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const groupType = event.dataTransfer.getData('application/ice-group');
      const blockType = event.dataTransfer.getData('application/ice-block');
      const resourceType = event.dataTransfer.getData('application/ice-resource');

      if (!groupType && !blockType && !resourceType) return;

      const canvasPos = screenToCanvas(event.clientX, event.clientY);
      const targetContainer = findContainerAtPosition(canvasPos.x, canvasPos.y);

      logDrop({
        position: canvasPos,
        targetContainer: targetContainer?.id,
        nodeType: groupType ? `Group.${groupType}` : blockType || resourceType,
      });

      // --- Group drop: create empty organizational container ---
      if (groupType) {
        const iceType = `Group.${groupType}`;
        const label = event.dataTransfer.getData('application/ice-group-name') || 'New Group';
        const groupColor = event.dataTransfer.getData('application/ice-group-color') || '#3b82f6';
        const newNode: CardNode = {
          id: `group-${Date.now()}`,
          type: 'container',
          position: { x: canvasPos.x, y: canvasPos.y },
          width: 400,
          height: 300,
          data: {
            label,
            iceType,
            groupColor,
            behavior: 'container',
            folded: false,
          },
        };
        dispatch(addNodeToCard(newNode));
        return;
      }

      // --- Blueprint expansion for blocks (flat cards) ---
      if (blockType) {
        const paletteProvider = event.dataTransfer.getData('application/ice-block-provider') || 'all';
        // Fall back to the active deploy provider when palette didn't pin one,
        // so deploy-panel doesn't filter the block as "skipped — non-<provider>".
        const effectiveProvider = paletteProvider !== 'all' ? paletteProvider : deployProvider;
        // Feature-flag gate: a disabled (category, provider) combo falls
        // through to the bare-resource fallback below, which tags the node
        // `providerUnsupported` so the existing warning badge + deploy
        // validator pick it up.
        const gateBlocked = effectiveProvider && !isIceTypeEnabledForProvider(blockType, effectiveProvider);
        const blueprint = gateBlocked ? undefined : getBlueprint(blockType, effectiveProvider);
        if (blueprint) {
          // Validate containment for the node's iceType
          const nodeIceType = (blueprint.nodeData.iceType as string) || '';
          const targetIceType = targetContainer ? (targetContainer.data.iceType as string) : '';
          const canContainNode = targetContainer ? canContain(targetIceType, nodeIceType) : true;

          const expanded = expandBlueprint(blueprint, {
            position: canvasPos,
            provider: effectiveProvider as any,
            parentContainerId: canContainNode && targetContainer ? targetContainer.id : undefined,
          });

          // Merge any palette-level data overrides (e.g. runtime selection)
          const blockDataRaw = event.dataTransfer.getData('application/ice-block-data');
          if (blockDataRaw) {
            try {
              const overrides = JSON.parse(blockDataRaw);
              Object.assign(expanded.node.data, overrides);
            } catch {
              /* ignore bad JSON */
            }
          }

          logBlueprint({
            type: blueprint.iceType,
            provider: paletteProvider !== 'all' ? paletteProvider : undefined,
            childCount: 0,
            containerWidth: expanded.node.width,
            containerHeight: expanded.node.height,
          });

          dispatch(expandBlueprintToCard(expanded));
          dispatch(setGhosts(generateGhostSuggestions(expanded.node as unknown as CardNode, nodes, edges)));
          return;
        }
        // fallback: no blueprint found — create empty resource node
      }

      const iceType = resourceType || 'Resource.Unknown';

      const label =
        event.dataTransfer.getData('application/ice-block-name') ||
        event.dataTransfer.getData('application/ice-resource-name') ||
        iceType;

      // Validate containment
      const targetIceType = targetContainer ? (targetContainer.data.iceType as string) : '';
      const canContainNode = targetContainer ? canContain(targetIceType, iceType) : true;

      // If the drop fell through because of the (category × provider) gate,
      // mark the node `providerUnsupported` so the existing warning badge
      // surfaces and deploy validation refuses to ship it.
      const gateBlockedAtFallback =
        deployProvider && iceType !== 'Resource.Unknown'
          ? !isIceTypeEnabledForProvider(iceType, deployProvider)
          : false;
      const newNodeData = {
        label,
        iceType,
        behavior: 'singleton',
        folded: false,
        provider: deployProvider,
        ...(gateBlockedAtFallback ? { providerUnsupported: true } : {}),
      };
      const newNode: CardNode = {
        id: `node-${Date.now()}`,
        type: 'resource',
        position: { x: canvasPos.x, y: canvasPos.y },
        width: computeCompactNodeWidth(false),
        height: computeCompactNodeHeight(newNodeData as Record<string, unknown>, false),
        data: newNodeData,
        ...(canContainNode &&
          targetContainer && {
            parentId: targetContainer.id,
          }),
      };

      // Add node to active card
      dispatch(addNodeToCard(newNode));
      dispatch(setGhosts(generateGhostSuggestions(newNode, nodes, edges)));
    },
    [screenToCanvas, findContainerAtPosition, dispatch, nodes, edges, deployProvider],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return { handleDrop, handleDragOver };
}
