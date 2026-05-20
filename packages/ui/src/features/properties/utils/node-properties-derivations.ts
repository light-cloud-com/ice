/**
 * Pure helpers for the Node Properties Section orchestrator.
 *
 * Extracted from `components/sections/node-properties-section.tsx` during
 * rf-npsec-1. Each helper takes a node + ancillary context and returns a
 * single derived primitive. Pulled out together so the orchestrator's body
 * shrinks to a list of named calls.
 *
 * Behavior preserved verbatim from the inline expressions.
 */

import { getIcon, DEFAULT_ICON, type Provider } from '../../../assets/icons';
import { getBrandIcon } from '../../../assets/icons/brand-registry';
import type { Card, CardNode } from '../../../store/slices/cards-slice';

/**
 * Look up the icon URL for the node, preferring brand icons (matched by
 * `runtime` / `iceType` / `label` in that order) and falling back to the
 * provider-typed icon, then the DEFAULT_ICON.
 */
export function resolveNodeIconUrl(selectedNode: CardNode, iceType: string, provider: string, label: string): string {
  const brandIcon =
    getBrandIcon((selectedNode.data?.runtime as string) || '') || getBrandIcon(iceType) || getBrandIcon(label);
  const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
  return brandIcon?.url || providerIcon?.icon || DEFAULT_ICON;
}

/**
 * Returns the Custom Domain edge that targets `selectedNode`, or null. A
 * "custom domain edge" is one connecting selectedNode to a node whose
 * iceType is `Network.CustomDomain`.
 */
export function findCustomDomainEdge(
  activeCard: Card,
  selectedNode: CardNode,
): { edge: Card['edges'][number]; cdNode: Card['nodes'][number] } | null {
  const edge = activeCard.edges.find((e) => {
    if (e.source !== selectedNode.id && e.target !== selectedNode.id) return false;
    const otherId = e.source === selectedNode.id ? e.target : e.source;
    const otherNode = activeCard.nodes.find((n) => n.id === otherId);
    return (otherNode?.data as { iceType?: string } | undefined)?.iceType === 'Network.CustomDomain';
  });
  if (!edge) return null;
  const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
  const cdNode = activeCard.nodes.find((n) => n.id === otherId);
  if (!cdNode) return null;
  return { edge, cdNode };
}

/**
 * Returns true when this iceType has a "Source & CI" tab, i.e. compute
 * services that build from a repo (everything starting with `Compute.`)
 * and the `Network.Gateway` block. The `Source.Repository` block does NOT
 * count here — it gets its own special section.
 */
export function nodeHasSourceTab(iceType: string): boolean {
  return (iceType.startsWith('Compute.') || iceType === 'Network.Gateway') && iceType !== 'Source.Repository';
}
