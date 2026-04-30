/**
 * Pass 1.4 — Source.Repository → compute block wiring.
 *
 * Lifted verbatim from `card-translator.ts` (rf-ctrans-10). Mutates the
 * in-progress graph in place by copying repository fields from any
 * Source.Repository node onto the compute node it's wired to. See the
 * docstring on `wire_source_repositories` below for the full contract.
 */

import type { CardEdgeInput, CardNodeInput } from '../card-translator.js';
import type { MutableGraph } from '../../graph/mutable-graph.js';

/**
 * Pass 1.4 — Source.Repository → compute block wiring.
 *
 * Source.Repository blocks are UI-only — they're not deployed as their
 * own resource. They exist to declare "this compute block deploys from
 * this repo with this build command". The handlers (Firebase Hosting
 * for static sites, Cloud Run via Cloud Build for containers) need
 * these fields on the compute node's own properties because the deploy
 * engine doesn't pass edge metadata.
 *
 * For each edge whose source is a Source.Repository node, copy
 * `repository`, `branch`, `buildCommand`, `outputDirectory`, and
 * `path` onto the target compute node — but only when the target
 * doesn't already have a non-empty value (the user's explicit per-block
 * override always wins).
 *
 * Mutates `graph` node properties in place; returns void.
 */
export function wire_source_repositories(
  edges: CardEdgeInput[],
  nodes: CardNodeInput[],
  card_id_to_name: Map<string, string>,
  graph: MutableGraph,
): void {
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    let repoNode: typeof src;
    let computeNode: typeof src;
    if (srcIce === 'Source.Repository') {
      repoNode = src;
      computeNode = dst;
    } else if (dstIce === 'Source.Repository') {
      repoNode = dst;
      computeNode = src;
    } else {
      continue;
    }
    const computeName = card_id_to_name.get(computeNode.id);
    if (!computeName) continue;
    const computeGraphNode = graph.nodes.get(computeName as any);
    if (!computeGraphNode) continue;

    const repoData = repoNode.data || {};
    const targetProps = computeGraphNode.properties as Record<string, unknown>;
    const fieldsToCopy: Array<[string, string]> = [
      ['repository', 'repository'],
      ['branch', 'branch'],
      ['buildCommand', 'build_command'],
      ['outputDirectory', 'output_directory'],
      ['path', 'source_path'],
    ];
    // Connected Source.Repository ALWAYS wins. Mirrors how
    // Network.CustomDomain → target.domain works: the wired source
    // block is the declarative source of truth, and any local value
    // on the target is treated as a stale leftover. Without this,
    // older Pass-1.4 logic only overwrote `undefined`/empty fields,
    // which silently kept stale repo names from earlier deploys.
    for (const [from, to] of fieldsToCopy) {
      const value = (repoData as any)[from];
      if (value !== undefined && value !== '') {
        targetProps[to] = value;
      }
    }
  }
}
