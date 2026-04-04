/**
 * useCostCalculation — Central hook for cost estimation panel
 *
 * Reads the active card's nodes/edges and computes all cost metrics.
 * Loads resource definitions to look up costs from option details.
 */

import { SCALE_TIERS, type ScaleTier } from '@ice/core/resources';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectActiveCard, type CardNode, type CardEdge } from '../../../store/slices/cards-slice';
import { getApi } from '../../../shared/api/api-adapter';
import type { RootState } from '../../../store';
import {
  computeCostSummary,
  type CostSummary,
  type ResourceMap,
  type ResourceDef,
} from '../utils/cost-calculator';
import {
  estimateDataTransferCost,
  compareProviderCosts,
  countTrafficConnections,
  type DataTransferEstimate,
  type ProviderCostComparison,
} from '../utils/provider-pricing';

export interface CostCalculationResult {
  summary: CostSummary;
  dataTransfer: DataTransferEstimate;
  providerComparison: ProviderCostComparison[];
  trafficConnectionCount: number;
  primaryProvider: string;
  hasNodes: boolean;
  resourceMap: ResourceMap | null;
}

// Module-level cache so we don't re-fetch on every panel toggle
let _cachedResourceMap: ResourceMap | null = null;

export function useCostCalculation(trafficTierIndex: number): CostCalculationResult {
  const activeCard = useSelector((state: RootState) => selectActiveCard(state));
  const [resourceMap, setResourceMap] = useState<ResourceMap | null>(_cachedResourceMap);

  const nodes: CardNode[] = activeCard?.nodes || [];
  const edges: CardEdge[] = activeCard?.edges || [];

  // Load resource definitions once (for cost lookups)
  useEffect(() => {
    if (_cachedResourceMap) return;
    getApi()
      .resources.getAll()
      .then((data: any[]) => {
        const map: ResourceMap = new Map();
        const resources =
          Array.isArray(data) && data.length > 0 && 'resources' in data[0]
            ? (data as Array<{ resources: ResourceDef[] }>).flatMap((cat) => cat.resources)
            : (data as ResourceDef[]);
        for (const r of resources) {
          const id = (r as any).id || r.ice_type;
          // Preserve the resourceId on the def so cost lookup can use it for scale presets
          if (id) r.id = id;
          if (id) map.set(id, r);
          if (r.ice_type && r.ice_type !== id) map.set(r.ice_type, r);
        }
        _cachedResourceMap = map;
        setResourceMap(map);
      })
      .catch(() => {
        // API not available — costs will fall back to estimatedCost from node data
      });
  }, []);

  // Map traffic tier index → ScaleTier name
  const scaleTier: ScaleTier = SCALE_TIERS[trafficTierIndex] ?? 'moderate';

  const summary = useMemo(
    () => computeCostSummary(nodes, resourceMap, scaleTier),
    [nodes, resourceMap, scaleTier],
  );

  const primaryProvider = useMemo(() => {
    const providerCounts = new Map<string, number>();
    for (const node of nodes) {
      const p = (node.data?.provider as string) || '';
      if (p) providerCounts.set(p, (providerCounts.get(p) || 0) + 1);
    }
    let maxProvider = 'aws';
    let maxCount = 0;
    for (const [p, count] of providerCounts) {
      if (count > maxCount) {
        maxProvider = p;
        maxCount = count;
      }
    }
    return maxProvider;
  }, [nodes]);

  const dataTransfer = useMemo(
    () => estimateDataTransferCost(primaryProvider, trafficTierIndex),
    [primaryProvider, trafficTierIndex],
  );

  const providerComparison = useMemo(
    () => compareProviderCosts(nodes, primaryProvider, resourceMap, scaleTier),
    [nodes, primaryProvider, resourceMap, scaleTier],
  );

  const trafficConnectionCount = useMemo(() => {
    const counts = countTrafficConnections(nodes, edges);
    let total = 0;
    for (const c of counts.values()) total += c;
    return total;
  }, [nodes, edges]);

  return {
    summary,
    dataTransfer,
    providerComparison,
    trafficConnectionCount,
    primaryProvider,
    resourceMap,
    hasNodes: nodes.length > 0,
  };
}
