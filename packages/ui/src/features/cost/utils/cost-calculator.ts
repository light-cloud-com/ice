/**
 * Cost Calculator Utilities
 *
 * Shared cost parsing, formatting, and aggregation logic used by the
 * cost estimation panel and properties panel.
 */

import { getScalePreset, type ScaleTier } from '@ice/core/resources';
import type { CardNode } from '../../../store/slices/cards-slice';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodeCostInfo {
  nodeId: string;
  label: string;
  iceType: string;
  category: string;
  provider: string;
  monthlyCost: number;
  isScalable: boolean;
  minInstances: number;
  maxInstances: number;
  activeInstances: number;
  perInstanceCost: number;
}

export interface CategoryCost {
  category: string;
  label: string;
  totalCost: number;
  nodes: NodeCostInfo[];
}

export interface ScalingCostRange {
  minCost: number;
  currentCost: number;
  maxCost: number;
}

export interface CostSummary {
  totalMonthlyCost: number;
  categories: CategoryCost[];
  scalingRange: ScalingCostRange;
  nodeCount: number;
  scalableNodeCount: number;
}

// ─── Category mapping ───────────────────────────────────────────────────────
// Maps the iceType PREFIX (e.g., "Database" from "Database.PostgreSQL") to a
// display category. Unknown prefixes fall through to "Other".

const PREFIX_TO_CATEGORY: Record<string, string> = {
  Compute: 'Compute',
  Database: 'Data',
  Storage: 'Data',
  Messaging: 'Messaging',
  Network: 'Networking',
  Security: 'Security',
  Monitoring: 'Observability',
  Analytics: 'Analytics',
  AI: 'AI / ML',
  Config: 'Config',
  Source: 'Source',
};

/** Resolve iceType → display category using prefix-based lookup */
function resolveCategory(iceType: string): string {
  const prefix = iceType.split('.')[0];
  return PREFIX_TO_CATEGORY[prefix] || 'Other';
}

const CATEGORY_LABELS: Record<string, string> = {
  Compute: 'Compute',
  Data: 'Data Storage',
  Messaging: 'Messaging',
  Networking: 'Networking',
  Security: 'Security',
  Observability: 'Observability',
  Analytics: 'Analytics',
  'AI / ML': 'AI / ML',
  Config: 'Config',
  Source: 'Source',
  Other: 'Other',
};

// ─── Parsing ────────────────────────────────────────────────────────────────

/** Parse cost strings like "~$36/mo", "$60-120", "$0.023/GB/mo", "Free" → numeric value */
export function parseCostRange(cost: string): number {
  if (!cost || /free/i.test(cost)) return 0;
  const matches = cost.match(/\$([\d,]+(?:\.\d+)?)(?:[–-]([\d,]+(?:\.\d+)?))?/);
  if (!matches) return 0;
  const low = parseFloat(matches[1].replace(/,/g, ''));
  const high = matches[2] ? parseFloat(matches[2].replace(/,/g, '')) : low;
  return (low + high) / 2;
}

/** Detect if a cost string is a per-unit rate (e.g., "$0.023/GB/mo", "$0.25/M RUs") */
function isPerUnitCost(cost: string): boolean {
  return /\/GB|\/TB|\/M\b|\/K\b|\/RU/i.test(cost);
}

// ─── Usage-based cost estimation ────────────────────────────────────────────
// Estimated storage volumes (GB) and request counts per traffic tier.
// These represent typical usage for a single storage bucket at each scale.

const STORAGE_GB_BY_TIER: Record<string, number> = {
  dev: 1,
  low: 10,
  moderate: 50,
  medium: 200,
  high: 1000,
  'very-high': 10000,
};

const REQUESTS_M_BY_TIER: Record<string, number> = {
  dev: 0.01,
  low: 0.1,
  moderate: 1,
  medium: 10,
  high: 100,
  'very-high': 1000,
};

/**
 * Convert a per-unit rate string to a flat monthly cost using traffic tier estimates.
 * e.g., "$0.023/GB/mo" at "medium" tier → 0.023 * 200 = $4.60/mo
 */
function resolvePerUnitCost(cost: string, rate: number, tier: string): number {
  if (/\/GB/i.test(cost)) return rate * (STORAGE_GB_BY_TIER[tier] ?? 50);
  if (/\/TB/i.test(cost)) return (rate * (STORAGE_GB_BY_TIER[tier] ?? 50)) / 1000;
  if (/\/M\b/i.test(cost)) return rate * (REQUESTS_M_BY_TIER[tier] ?? 1);
  if (/\/K\b/i.test(cost)) return rate * (REQUESTS_M_BY_TIER[tier] ?? 1) * 1000;
  return rate; // Flat rate, return as-is
}

// ─── Instance count estimation by tier ──────────────────────────────────────
// For scalable services, estimate what fraction of max instances would be
// running at each traffic tier. At "dev" you run min, at "very-high" you run max.

const TIER_SCALE_FACTOR: Record<string, number> = {
  dev: 0, // min instances only
  low: 0.1,
  moderate: 0.25,
  medium: 0.5,
  high: 0.75,
  'very-high': 1, // max instances
};

/** Estimate active instance count for a scalable service at a given tier */
function estimateInstances(min: number, max: number, tier: string): number {
  const factor = TIER_SCALE_FACTOR[tier] ?? 0.25;
  return Math.max(min, Math.round(min + (max - min) * factor));
}

/** Format a numeric cost as display string */
export function formatCost(value: number): string {
  if (value === 0) return 'Free';
  if (value < 0.01) return '< $0.01/mo';
  if (value < 1) return `~$${value.toFixed(2)}/mo`;
  if (value >= 1000) return `~$${(value / 1000).toFixed(1)}k/mo`;
  return `~$${Math.round(value)}/mo`;
}

/** Format cost without the /mo suffix (for annual/quarterly) */
export function formatCostRaw(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.01) return '< $0.01';
  if (value < 1) return `~$${value.toFixed(2)}`;
  if (value >= 10000) return `~$${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `~$${Math.round(value).toLocaleString()}`;
  return `~$${Math.round(value)}`;
}

// ─── Resource definition types (mirrors properties-panel) ───────────────────

export interface OptionDetail {
  value: string;
  label: string;
  description?: string;
  cost?: string;
  provider?: string;
}

export interface ResourceProperty {
  name: string;
  default?: unknown;
  optionDetails?: OptionDetail[];
}

export interface ResourceDef {
  id?: string;
  ice_type: string;
  properties: ResourceProperty[];
}

export type ResourceMap = Map<string, ResourceDef>;

// ─── Node cost extraction ───────────────────────────────────────────────────

/**
 * Look up a node's cost from resource definitions by matching its configured
 * property values (e.g., `size: "db.t3.medium"`) against the optionDetails
 * that include cost hints.
 *
 * When a scaleTier is provided, the scale preset values override the node's
 * own values — this answers "what would this cost at Medium traffic?"
 *
 * Lookup order for each property with optionDetails:
 * 1. Scale preset value for the selected tier (if tier provided)
 * 2. Node's actual value for that property
 * 3. The property's default value from the resource definition
 * 4. First provider-matching option with a cost
 */
function lookupCostFromResources(
  data: Record<string, unknown>,
  resourceMap: ResourceMap | null,
  scaleTier?: ScaleTier | null,
): string {
  if (!resourceMap || resourceMap.size === 0) return '';

  const iceType = (data.iceType as string) || (data.ice_type as string) || '';
  const resourceId = (data.resourceId as string) || '';
  const provider = (data.provider as string) || '';
  const resourceDef = resourceMap.get(resourceId) || resourceMap.get(iceType);
  if (!resourceDef) return '';

  // Resolve resourceId — use node data, or fall back to the resource definition's own id
  const resolvedResourceId = resourceId || (resourceDef as any).id || '';

  // Get scale preset overrides for the selected tier
  const presetOverrides =
    scaleTier && resolvedResourceId ? getScalePreset(resolvedResourceId, scaleTier, provider) : {};

  // Check each property's optionDetails for a cost-bearing match
  for (const prop of resourceDef.properties) {
    if (!prop.optionDetails) continue;

    // Determine the effective value: scale preset → node data → property default
    const nodeValue = presetOverrides[prop.name] ?? data[prop.name] ?? prop.default;

    if (nodeValue != null) {
      // Find the matching option — prefer provider-specific match, then any
      const match = provider
        ? prop.optionDetails.find((o) => o.value === String(nodeValue) && o.cost && o.provider === provider) ||
          prop.optionDetails.find((o) => o.value === String(nodeValue) && o.cost)
        : prop.optionDetails.find((o) => o.value === String(nodeValue) && o.cost);
      if (match?.cost) return match.cost;
    }

    // Last resort: first option with a cost (prefer provider-specific if provider is known)
    const fallback = provider
      ? prop.optionDetails.find((o) => o.cost && o.provider === provider) || prop.optionDetails.find((o) => o.cost)
      : prop.optionDetails.find((o) => o.cost);
    if (fallback?.cost) return fallback.cost;
  }

  return '';
}

/** Extract cost info from a single node */
export function getNodeCostInfo(
  node: CardNode,
  resourceMap?: ResourceMap | null,
  scaleTier?: ScaleTier | null,
): NodeCostInfo {
  const data = node.data || {};
  const iceType = (data.iceType as string) || (data.ice_type as string) || '';
  const label = (data.label as string) || node.id;
  const provider = (data.provider as string) || '';
  const behavior = (data.behavior as string) || '';
  const isScalable = behavior === 'scalable';

  const minInstances = (data.minInstances as number) ?? (data.min_instances as number) ?? 1;
  const maxInstances = (data.maxInstances as number) ?? (data.max_instances as number) ?? minInstances;
  const configuredInstances = (data.activeInstances as number) ?? minInstances;

  // When a traffic tier is set, estimate instance count based on the tier.
  // At "dev" → min instances, at "very-high" → max instances.
  const activeInstances =
    scaleTier && isScalable ? estimateInstances(minInstances, maxInstances, scaleTier) : configuredInstances;

  // Try estimatedCost from node data first, then look up from resource definitions.
  // When a scaleTier is set, always prefer the resource lookup (tier overrides node config).
  const estimatedCost = scaleTier
    ? lookupCostFromResources(data, resourceMap ?? null, scaleTier) || (data.estimatedCost as string) || ''
    : (data.estimatedCost as string) || lookupCostFromResources(data, resourceMap ?? null);

  const rawRate = parseCostRange(estimatedCost);
  // For per-unit costs ($/GB, $/M requests), multiply by estimated usage at this tier
  const baseCost = isPerUnitCost(estimatedCost)
    ? resolvePerUnitCost(estimatedCost, rawRate, scaleTier || 'moderate')
    : rawRate;
  // For scalable services the estimatedCost is per-instance
  const perInstanceCost = isScalable ? baseCost : 0;
  const monthlyCost = isScalable ? baseCost * activeInstances : baseCost;

  const category = resolveCategory(iceType);

  return {
    nodeId: node.id,
    label,
    iceType,
    category,
    provider,
    monthlyCost,
    isScalable,
    minInstances,
    maxInstances,
    activeInstances,
    perInstanceCost,
  };
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/** Compute full cost summary for a set of nodes */
export function computeCostSummary(
  nodes: CardNode[],
  resourceMap?: ResourceMap | null,
  scaleTier?: ScaleTier | null,
): CostSummary {
  const infos = nodes.filter((n) => n.type !== 'container').map((n) => getNodeCostInfo(n, resourceMap, scaleTier));

  // Group by category
  const categoryMap = new Map<string, NodeCostInfo[]>();
  for (const info of infos) {
    const existing = categoryMap.get(info.category) || [];
    existing.push(info);
    categoryMap.set(info.category, existing);
  }

  const categories: CategoryCost[] = [];
  for (const [category, categoryNodes] of categoryMap) {
    categories.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      totalCost: categoryNodes.reduce((sum, n) => sum + n.monthlyCost, 0),
      nodes: categoryNodes,
    });
  }
  // Sort categories by cost descending
  categories.sort((a, b) => b.totalCost - a.totalCost);

  const totalMonthlyCost = infos.reduce((sum, n) => sum + n.monthlyCost, 0);
  const scalableNodes = infos.filter((n) => n.isScalable);

  // Scaling range: min = all at minInstances, max = all at maxInstances
  const fixedCost = infos.filter((n) => !n.isScalable).reduce((sum, n) => sum + n.monthlyCost, 0);

  const scalableMinCost = scalableNodes.reduce((sum, n) => sum + n.perInstanceCost * n.minInstances, 0);
  const scalableMaxCost = scalableNodes.reduce((sum, n) => sum + n.perInstanceCost * n.maxInstances, 0);

  return {
    totalMonthlyCost,
    categories,
    scalingRange: {
      minCost: fixedCost + scalableMinCost,
      currentCost: totalMonthlyCost,
      maxCost: fixedCost + scalableMaxCost,
    },
    nodeCount: infos.length,
    scalableNodeCount: scalableNodes.length,
  };
}
