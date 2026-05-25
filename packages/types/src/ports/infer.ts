/**
 * Render-time port inference for legacy edges.
 *
 * Edges created before the port-driven socket model — or AI-generated
 * edges that didn't specify ports — have no `sourceSocket` /
 * `targetSocket` on `edge.data`. They should still render with the
 * right magnetic anchors, so the canvas tells the user a deterministic
 * story: a Repo → Frontend edge attaches to the `repository-in` socket
 * on the Frontend, even if the edge data is silent.
 *
 * Inference scores all (sourceOut × targetIn) port pairs and picks the
 * best match. The result is NOT written back to the edge — purely
 * visual. The user can right-click an edge → "Reconnect typed" if they
 * want to lock in explicit ports.
 */

import { canPortsConnect } from './match';
import { ROLE_CATEGORY } from './types';
import type { PortDef } from './types';
import type { ConnectionCategory } from '@ice/constants';

export interface InferredEdgePorts {
  sourcePort?: PortDef;
  targetPort?: PortDef;
}

/**
 * Score how well a candidate (src, tgt) port pair matches an edge.
 *
 * Roughly:
 *   +100 — roles match exactly (not `any`)
 *   +30  — role's connection category matches the edge's category
 *   +10  — both are not `any`
 *   -50  — either is `any` (passthrough wins only when nothing else does)
 *
 * Higher is better. Pairs that can't connect at all return 0.
 */
function score(src: PortDef, tgt: PortDef, category: ConnectionCategory | null): number {
  if (!canPortsConnect(src, tgt)) return 0;
  let s = 0;
  if (src.role === tgt.role && src.role !== 'any') s += 100;
  if (src.role === 'any' || tgt.role === 'any') s -= 50;
  else s += 10;
  if (category && ROLE_CATEGORY[src.role] === category) s += 30;
  return s;
}

/**
 * Pick the best (source OUT, target IN) port pair given the two nodes'
 * port lists and the edge's known category. Returns whichever side
 * could be resolved — if no pair scores above 0, the result has both
 * sides undefined and the renderer falls back to anonymous routing.
 */
export function inferEdgePorts(
  sourcePorts: PortDef[],
  targetPorts: PortDef[],
  category: ConnectionCategory | null,
): InferredEdgePorts {
  let best: { src?: PortDef; tgt?: PortDef; score: number } = { score: 0 };
  for (const src of sourcePorts) {
    if (src.direction !== 'out') continue;
    for (const tgt of targetPorts) {
      if (tgt.direction !== 'in') continue;
      const s = score(src, tgt, category);
      if (s > best.score) best = { src, tgt, score: s };
    }
  }
  return { sourcePort: best.src, targetPort: best.tgt };
}
