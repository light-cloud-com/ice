/**
 * Get pipeline statuses for all service nodes connected to a Source.Repository
 * block (or any node with `behavior === 'source'`). Used by the per-node
 * renderer dispatch (`renderCanvasNode`) so a repo block can render an
 * aggregate of its downstream pipeline activity.
 *
 * Behavior preserved verbatim from the inline `getConnectedPipelineStatuses`
 * useCallback previously in `svg-canvas.tsx` L448-466 (rf-canv2-5).
 *
 * The function returns `[]` for any non-source node and for the no-card
 * case so the caller doesn't have to defensively check before iterating.
 *
 * rf-canv2-5.
 */

import type { CardEdge, Card } from '../../../store/slices/cards-slice';
import type { NodePipelineStatus } from '../../../store/slices/pipeline-slice';
import type { CanvasNode } from '../components/types';

export type ConnectedPipelineStatus = Pick<NodePipelineStatus, 'status'>;

export function getConnectedPipelineStatuses(
  node: CanvasNode,
  card: Card | undefined,
  pipelineNodeStatus: Record<string, NodePipelineStatus>,
): ConnectedPipelineStatus[] {
  const iceType = (node.data?.iceType as string) || '';
  if (iceType !== 'Source.Repository' && node.data?.behavior !== 'source') return [];
  if (!card) return [];

  const cardEdges = card.edges as CardEdge[];
  const connectedEdges = cardEdges.filter((e) => e.source === node.id || e.target === node.id);
  const statuses: ConnectedPipelineStatus[] = [];

  for (const edge of connectedEdges) {
    const serviceId = edge.source === node.id ? edge.target : edge.source;
    const ps = pipelineNodeStatus[serviceId];
    if (ps) statuses.push(ps);
  }
  return statuses;
}
