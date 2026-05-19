/**
 * Pure helpers for resolving a scheduler resource result to its canvas
 * node id. Extracted from `services/deploy/src/services/deploy.service.ts`
 * (rf-deploy-3). The orchestrator stays responsible for loading the
 * persisted mapping (`getResourceMap(cardId, environment)`); this module
 * is pure (no DB) and only knows how to build the in-memory lookup tables
 * and run the 4-tier fallback chain.
 */

/** Minimal shape of a translation deployable that this module reads.
 *  Wider shapes are accepted at the callsite — only these three fields
 *  are used here, and the orchestrator's actual deployable carries more. */
export interface DeployableForResourceMaps {
  resource_type: string;
  resource_name: string;
  node_id: string;
}

/** Minimal shape of a persisted mapping entry. The orchestrator's
 *  `ResourceMappingEntry` is wider (`name: string; type: string;
 *  providerId?: string`), but the only fields this module reads are
 *  `name` and `providerId`, both treated as optional defensively. */
export interface PersistedMappingEntry {
  name?: string;
  providerId?: string;
}

export interface ResourceNameMaps {
  /** `resource_name → canvas node_id` from the current translation. */
  nameToNodeId: Map<string, string>;
  /** `${resource_type}:${resource_name}` (graph-node-id) → canvas node_id.
   *  See learning anchor `scheduler-resource-name-vs-graph-node-id-vs-
   *  canvas-node-id` for why this translation step exists. */
  graphIdToCanvasId: Map<string, string>;
  /** Rename-resilient fallback — persisted name → canvas node_id. */
  persistedNameToNodeId: Map<string, string>;
  /** Rename-resilient fallback — persisted provider_id → canvas node_id.
   *  More stable than name when the user renames a block. */
  persistedProviderIdToNodeId: Map<string, string>;
}

/**
 * Build the in-memory lookup tables used by `makeFindSourceNodeId`. Pure;
 * no I/O. The orchestrator is responsible for loading the persisted
 * mapping via `getResourceMap(cardId, environment)` and feeding the
 * resolved Map in.
 */
export function buildResourceNameMaps(
  deployables: DeployableForResourceMaps[],
  persistedMap: Map<string, PersistedMappingEntry>,
): ResourceNameMaps {
  const nameToNodeId = new Map<string, string>();
  const graphIdToCanvasId = new Map<string, string>();
  for (const d of deployables || []) {
    nameToNodeId.set(d.resource_name, d.node_id);
    graphIdToCanvasId.set(`${d.resource_type}:${d.resource_name}`, d.node_id);
  }

  const persistedNameToNodeId = new Map<string, string>();
  const persistedProviderIdToNodeId = new Map<string, string>();
  for (const [nodeId, entry] of persistedMap) {
    if (entry.name) persistedNameToNodeId.set(entry.name, nodeId);
    if (entry.providerId) persistedProviderIdToNodeId.set(entry.providerId, nodeId);
  }

  return { nameToNodeId, graphIdToCanvasId, persistedNameToNodeId, persistedProviderIdToNodeId };
}

/**
 * Build the closure used by `applyDeployment` to resolve a scheduler
 * resource result to a canvas node id. The lookup is 4-tier:
 *
 *   1. Exact name match against the current translation (`nameToNodeId`)
 *      using both `res.name` and `res.resource_id` as candidates.
 *   2. Suffix-stripped match against the same map — handlers may append
 *      `-0`, `-1`, `-proxy`, `-url-map` etc. to the base resource name.
 *   3. Persisted `provider_id` match (most stable across renames).
 *   4. Persisted name match (last resort).
 *
 * On no match, emits a `[deploy] findSourceNodeId: no match` console.warn
 * (load-bearing for ops) and returns `undefined`.
 */
export function makeFindSourceNodeId(args: {
  nameToNodeId: Map<string, string>;
  persistedNameToNodeId: Map<string, string>;
  persistedProviderIdToNodeId: Map<string, string>;
  cardId: string;
}): (res: any) => string | undefined {
  const { nameToNodeId, persistedNameToNodeId, persistedProviderIdToNodeId, cardId } = args;
  return (res: any): string | undefined => {
    const candidates = [res?.name, res?.resource_id].filter(Boolean) as string[];
    for (const c of candidates) {
      if (nameToNodeId.has(c)) return nameToNodeId.get(c);
    }
    // Handler may append a suffix like "-0", "-1", "-proxy", "-url-map".
    // Strip trailing segments until we hit a known base name.
    for (const c of candidates) {
      const parts = c.split('-');
      while (parts.length > 1) {
        parts.pop();
        const base = parts.join('-');
        if (nameToNodeId.has(base)) return nameToNodeId.get(base);
      }
    }
    // Fallback: the current translation didn't produce a matching name
    // (likely a rename / refactor / drifted resource). Try the persisted
    // mapping table — provider_id first (most stable), then name.
    const providerId = res?.provider_id || res?.providerId;
    if (providerId && persistedProviderIdToNodeId.has(providerId)) {
      return persistedProviderIdToNodeId.get(providerId);
    }
    for (const c of candidates) {
      if (persistedNameToNodeId.has(c)) return persistedNameToNodeId.get(c);
    }
    // Nothing matched anywhere — log so an ops engineer can correlate
    // the stranded resource in the deploy log later.
    console.warn(
      `[deploy] findSourceNodeId: no match for name=${res?.name} provider_id=${providerId || '?'} ` +
        `(card=${cardId.slice(0, 8)}). Canvas block will not receive a deploy_status overlay.`,
    );
    return undefined;
  };
}
