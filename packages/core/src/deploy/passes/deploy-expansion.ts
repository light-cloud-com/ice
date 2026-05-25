/**
 * Generic 1→N block expansion at translate time.
 *
 * Reads `deployExpansion` from the canonical block schema (a
 * `HighLevelResource`) and emits one graph node per entry in
 * `properties[partitionBy]`. The translator delegates here whenever a
 * resource declares expansion semantics — there is NO iceType-specific
 * logic in this file or the caller.
 *
 * Provider agnostic by construction: the per-resource properties shape
 * came from the provider's extractor; we forward it verbatim to each
 * emitted node and only touch the entry-derived name + per-entry label.
 * Adding a new provider for the same canonical block means adding an
 * extractor + handler for the provider's resource type — nothing here
 * changes.
 *
 * Dedupes within the block AND across blocks by resolved resource name
 * (`graph.has_node`) — two rows pointing at the same upstream entry
 * share one cloud resource.
 */

import { sanitize_label_value, sanitize_name } from '../utils/name-utils';
import type { MutableGraph } from '../../graph/mutable-graph';
import type { DeployExpansion } from '../../resources/high-level-resources';
import type { DeployableNodeInfo, SkippedNode } from '../card-translator';

export interface ExpandDeployableArgs {
  /** Schema-declared expansion metadata. */
  expansion: DeployExpansion;
  /** Canvas node id (passed through onto each deployable for traceability). */
  nodeId: string;
  /** Human-readable label for the source block. */
  blockLabel: string;
  /** Canonical iceType (stored on each deployable). */
  iceType: string;
  /** Provider-resolved resource type for the cloud handler. */
  resourceType: string;
  /** Extractor output — `properties[expansion.partitionBy]` is the partition source. */
  properties: Record<string, unknown>;
  /** Standard `ice-*` labels every emitted resource carries. */
  baseLabels: Record<string, string>;
  /** Mutable graph to add nodes to. */
  graph: MutableGraph;
  /** Receives one entry per emitted resource. */
  deployables: DeployableNodeInfo[];
  /** Receives a single skip entry when the block has zero usable rows. */
  skipped: SkippedNode[];
  /** Receives free-form warnings (empty partition, add-node failures). */
  warnings: string[];
  /** Provider id, used only for the empty-partition warning message. */
  provider: string;
}

export interface ExpandDeployableResult {
  /** Number of cloud resources added to the graph. */
  added: number;
}

/**
 * Coerce a raw partition entry into a uniform record so the rest of the
 * function can read fields by name regardless of how the user typed them.
 * Lifts plain strings into a single-field record under `nameFrom.field`
 * (covers the legacy `string[]` shape that pre-dated the typed `{key,ref}`
 * editor — projects don't lose data on first edit).
 */
function normalizeEntry(raw: unknown, expansion: DeployExpansion): Record<string, string> | null {
  if (typeof raw === 'string') {
    const v = raw.trim();
    if (!v) return null;
    return { [expansion.nameFrom.field]: v };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') out[k] = v.trim();
    }
    return out;
  }
  return null;
}

/** Resolve the cloud resource name for one entry, with fallback. */
function resolveEntryName(entry: Record<string, string>, expansion: DeployExpansion): string {
  const primary = entry[expansion.nameFrom.field];
  if (primary) return primary;
  if (expansion.nameFrom.fallback) {
    const fb = entry[expansion.nameFrom.fallback];
    if (fb) return fb;
  }
  return '';
}

export function expand_deployable_per_entry(args: ExpandDeployableArgs): ExpandDeployableResult {
  const {
    expansion,
    nodeId,
    blockLabel,
    iceType,
    resourceType,
    properties,
    baseLabels,
    graph,
    deployables,
    skipped,
    warnings,
    provider,
  } = args;

  const rawPartition = Array.isArray(properties[expansion.partitionBy])
    ? (properties[expansion.partitionBy] as unknown[])
    : [];
  const entries = rawPartition
    .map((row) => normalizeEntry(row, expansion))
    .filter((e): e is Record<string, string> => e !== null && Boolean(resolveEntryName(e, expansion)));

  if (entries.length === 0) {
    warnings.push(
      `"${blockLabel}" (${iceType}) has no ${expansion.partitionBy} configured. Nothing will be created in ${provider}.`,
    );
    skipped.push({
      nodeId,
      label: blockLabel,
      reason: `${iceType} has no ${expansion.partitionBy} configured`,
    });
    return { added: 0 };
  }

  // Strip the partition key from the per-resource properties — every
  // other field came from the provider's extractor and is already
  // shaped for that provider's handler.
  const { [expansion.partitionBy]: _strip, ...sharedProps } = properties;

  let added = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    const rawName = resolveEntryName(entry, expansion);
    const resourceName = sanitize_name(rawName);
    if (!resourceName || seen.has(resourceName)) continue;
    seen.add(resourceName);
    if (graph.get_node_by_name(resourceName)) continue;

    const perEntryLabels: Record<string, string> = { ...baseLabels };
    if (expansion.tagPerEntry) {
      const tagValue = entry[expansion.tagPerEntry.fromField];
      if (tagValue) perEntryLabels[expansion.tagPerEntry.labelKey] = sanitize_label_value(tagValue);
    }

    const addResult = graph.add_node({
      type: resourceType,
      name: resourceName,
      properties: { ...sharedProps, labels: perEntryLabels },
      labels: perEntryLabels,
    });

    if (!addResult.success) {
      warnings.push(
        `Failed to add ${resourceType} "${resourceName}" for block "${blockLabel}": ${addResult.errors?.join(', ')}`,
      );
      continue;
    }

    const labelSuffix = expansion.labelFrom ? entry[expansion.labelFrom] : undefined;
    deployables.push({
      node_id: nodeId,
      label: labelSuffix ? `${blockLabel} · ${labelSuffix}` : blockLabel,
      ice_type: iceType,
      resource_type: resourceType,
      resource_name: resourceName,
    });
    added++;
  }

  return { added };
}
