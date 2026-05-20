/**
 * AI ops — blueprint resolution.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-4). Single export
 * `resolveBlueprint` that takes an `AddBlueprintOp` and the current card
 * state and produces a fully-formed `CardNode` ready for `addNodeToCard`.
 *
 * Behavior:
 *   - Looks up the blueprint via `getBlueprint(op.iceType, op.provider)`.
 *     Returns `null` if no blueprint exists — the caller (executor) treats
 *     this as a skipped op and records "Blueprint not found: <iceType>".
 *   - Resolves `op.parentId` through the running `idMap` so the AI can
 *     reference its own placeholder containers from earlier ops.
 *   - Picks a position: explicit `op.position` wins; otherwise routes
 *     through `findPosition(card, parentContainerId)`.
 *   - Calls `expandBlueprint` to materialize the canonical node from the
 *     blueprint definition.
 *   - Layers `op.label` (sets data.label) and `op.dataOverrides` (shallow-
 *     merged into data) on top of the expanded node — both are optional.
 *
 * Pure: no dispatch, no store reads — the caller owns those.
 */

import { resolveId } from './id-utils';
import { findPosition } from './position-finder';
import { getBlueprint, expandBlueprint } from '../../../../config/blocks';
import type { Provider } from '../../../../config/blocks/types';
import type { Card, CardNode } from '../../../../store/slices/cards-slice';
import type { AddBlueprintOp } from '@ice/types';

export function resolveBlueprint(op: AddBlueprintOp, card: Card, idMap: Map<string, string>): CardNode | null {
  const blueprint = getBlueprint(op.iceType, op.provider);
  if (!blueprint) return null;

  const parentContainerId = op.parentId ? resolveId(op.parentId, idMap) : undefined;
  const position = op.position || findPosition(card, parentContainerId);

  const expanded = expandBlueprint(blueprint, {
    position,
    provider: (op.provider as Provider) || undefined,
    parentContainerId,
  });

  const node = expanded.node as CardNode;

  if (op.label) {
    node.data = { ...node.data, label: op.label };
  }
  if (op.dataOverrides) {
    node.data = { ...node.data, ...op.dataOverrides };
  }

  return node;
}
