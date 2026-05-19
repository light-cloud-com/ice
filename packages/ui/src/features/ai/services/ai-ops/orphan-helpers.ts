/**
 * AI ops — auto-connect orphaned helper nodes after a batch of operations.
 *
 * Extracted from `operation-executor.ts` (rf-aiop-6). Single export
 * `connectOrphanHelpers(dispatch, card)` that scans the post-execution
 * card for security/auth/secrets/monitoring helper nodes that have no
 * incoming or outgoing edges and connects them to the first detected
 * "backend"-shaped node with a `depends_on` edge.
 *
 * Why this exists: the AI sometimes adds auth or secrets blocks without
 * connecting them via explicit `addEdge` ops. Without this safety net
 * those nodes appear stranded on the canvas. Generalizes well — any
 * helper that the AI forgets to wire up gets auto-attached to the
 * primary backend.
 *
 * Returns the number of edges dispatched (for the orchestrator's
 * `executedOps` counter).
 *
 * Pattern preservation:
 *   - Backend match: any non-container node whose iceType (lowercased)
 *     matches `/container|backend|worker|service/`.
 *   - Helper match: any node whose iceType (lowercased) matches
 *     `/security|auth|secret|identity|monitoring|log|observ/` AND has
 *     no edge in the existing edge set.
 *   - The "primary backend" is `backends[0]` — the first one in card
 *     node order, which matches the original implementation.
 *   - Edge data: `{ relationship: 'depends_on' }`.
 */

import { generateEdgeId } from './id-utils';
import { addEdgeToCard } from '../../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../../store';
import type { Card } from '../../../../store/slices/cards-slice';

export function connectOrphanHelpers(dispatch: AppDispatch, card: Card): number {
  const connectedIds = new Set<string>();
  for (const e of card.edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  // Find backend nodes (Compute.Container, scalable backend, etc.)
  const backends = card.nodes.filter((n) => {
    const t = ((n.data?.iceType as string) || '').toLowerCase();
    return /container|backend|worker|service/.test(t) && n.type !== 'container';
  });

  // Find orphaned helper nodes (security, auth, secrets, logs) with no edges
  const orphanHelpers = card.nodes.filter((n) => {
    if (connectedIds.has(n.id)) return false;
    const t = ((n.data?.iceType as string) || '').toLowerCase();
    return /security|auth|secret|identity|monitoring|log|observ/.test(t);
  });

  if (backends.length === 0 || orphanHelpers.length === 0) return 0;

  const primaryBackend = backends[0];
  let dispatched = 0;
  for (const helper of orphanHelpers) {
    const edgeId = generateEdgeId();
    dispatch(
      addEdgeToCard({
        id: edgeId,
        source: primaryBackend.id,
        target: helper.id,
        data: { relationship: 'depends_on' },
      }),
    );
    dispatched++;
  }
  return dispatched;
}
