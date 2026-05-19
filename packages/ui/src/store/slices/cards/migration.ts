/**
 * Cards slice — node migration pipeline.
 *
 * Pure functions over `CardNode` payloads that upgrade legacy iceTypes to
 * the current shape. Called from every ingestion site in the slice
 * (`addNodeToCard`, `importToActiveCard`, `addToActiveCard`,
 * `expandBlueprintToCard`) plus the localStorage loader, so version-keyed
 * persistence and externally-sourced payloads (backend canvas restore,
 * clipboard, AI tool-use writes) all converge on the same shape.
 *
 * `migrateCardNodes` is re-exported from `../cards-slice` so external
 * consumers keep resolving the same import path during the rf-cards
 * decomposition.
 *
 * @see rf-cards-2
 * @see learning `data-version-bump-migrates-not-wipes` — version bumps
 *      MIGRATE the payload, never wipe; every ingestion path runs the
 *      migrator, not just the localStorage loader.
 */

import { isIceTypeEnabledForProvider } from '@ice/constants';
import type { CardNode } from './types';

/**
 * Organizational iceTypes that migrated from `Cluster.*` / `Block.*` to
 * `Group.*`. Module-private — only `migrateCardNode` consumes it.
 */
const BLOCK_TO_GROUP_TYPES = new Set(['Frontend', 'Services', 'Data', 'Messaging', 'Monitoring', 'External']);

/**
 * Migrate a single persisted node:
 * - Legacy `Monitoring.Terminal` → `Monitoring.Log` (v5 → v6 consolidation).
 * - Legacy `Cluster.* / Block.*` organizational types → `Group.*` with
 *   `type: 'container'`.
 *
 * Branch order is load-bearing: the `Monitoring.Terminal` rewrite runs
 * BEFORE the Cluster./Block. prefix check. The two conditions don't
 * actually overlap (`Monitoring.Terminal` doesn't start with `Cluster.`
 * or `Block.`) but the order is pinned so future additions don't reorder
 * by accident.
 *
 * Idempotent — running it on already-migrated payloads is a no-op and
 * returns the same reference for nodes that didn't need a change.
 *
 * Exported because `expandBlueprintToCard` ingests one node at a time.
 */
export function migrateCardNode(node: CardNode): CardNode {
  const iceType = (node.data?.iceType as string) || '';

  // v5 → v6: Monitoring.Terminal collapsed into Monitoring.Log.
  if (iceType === 'Monitoring.Terminal') {
    return { ...node, data: { ...node.data, iceType: 'Monitoring.Log' } };
  }

  // Legacy: Cluster.* / Block.* organizational types → Group.*
  if (iceType.startsWith('Cluster.') || iceType.startsWith('Block.')) {
    const prefix = iceType.startsWith('Cluster.') ? 'Cluster.' : 'Block.';
    const suffix = iceType.slice(prefix.length);
    if (BLOCK_TO_GROUP_TYPES.has(suffix)) {
      return {
        ...node,
        type: 'container' as const,
        data: { ...node.data, iceType: `Group.${suffix}` },
      };
    }
  }

  // Feature-flag gate: a node whose (category × provider) combo was disabled
  // since the project was last saved gets tagged with `providerUnsupported`
  // so the existing warning UI surfaces and deploy validation refuses to
  // ship it. Idempotent — the tag is set, never unset (an admin re-enabling
  // a combo will clear the tag on the next non-trivial edit).
  const provider = (node.data?.provider as string) || '';
  if (iceType && provider && !isIceTypeEnabledForProvider(iceType, provider)) {
    if (node.data?.providerUnsupported === true) return node;
    return { ...node, data: { ...node.data, providerUnsupported: true } };
  }

  return node;
}

/**
 * Migrate every node in a payload. Exported so external ingestion paths
 * (backend canvas restore, AI tool-use writes, tests) can reuse the same
 * migration pipeline as the localStorage loader.
 */
export function migrateCardNodes(nodes: CardNode[]): CardNode[] {
  return nodes.map(migrateCardNode);
}
