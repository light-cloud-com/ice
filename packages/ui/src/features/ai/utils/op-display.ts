/**
 * op-display — display helpers for AiCanvasOp values shown in chat.
 *
 * Two pure helpers, both lifted from `ai-chat-panel.tsx` verbatim:
 *
 *   - `opSummary(op)` — human-readable single-line summary used in the
 *     applied-operations list under each assistant message. The labels
 *     fall back to operation type when no friendlier name is available
 *     (e.g. `addBlueprint` falls back to its `iceType`).
 *   - `opBadgeColor(op)` — Tailwind class name for the colored leading
 *     badge (`+`, `×`, `~`). Three buckets: add (emerald), delete (red),
 *     update/everything else (blue).
 *
 * The `op.op.startsWith('delete')` / `'add'` order is observable: ops
 * whose name starts with "add" but contains "delete" later (none today)
 * would be misclassified by either order, but the existing source picks
 * delete-first to defend against `addAndDelete`-style names. Preserved
 * here for parity.
 */

import type { AiCanvasOp } from '@ice/types';

export function opSummary(op: AiCanvasOp): string {
  switch (op.op) {
    case 'addBlueprint':
      return `Add ${op.label || op.iceType}`;
    case 'addNode':
      return `Add ${(op.node.data?.label as string) || op.node.type}`;
    case 'addEdge':
      return `Connect ${op.edge.source} → ${op.edge.target}`;
    case 'updateNodeData':
      return `Update ${op.nodeId}`;
    case 'deleteNode':
      return `Remove ${op.nodeId}`;
    case 'deleteEdge':
      return `Remove connection`;
    case 'autoOrganize':
      return 'Reorganize layout';
    default:
      return `${op.op}`;
  }
}

export function opBadgeColor(op: AiCanvasOp): string {
  if (op.op.startsWith('delete')) return 'bg-red-500/20 text-red-400';
  if (op.op.startsWith('add')) return 'bg-emerald-500/20 text-emerald-400';
  return 'bg-blue-500/20 text-blue-400';
}
