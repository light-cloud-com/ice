/**
 * `useTableRows` — pure data pipeline for the inline table view.
 * Extracted from `inline-table-view.tsx` (rf-itab-3).
 *
 * Takes the orchestrator's filter / sort / group state plus the slice
 * of redux store needed to materialize rows, and returns the derived
 * arrays (rows / filtered / sorted / grouped) plus the per-status
 * counts and the unique provider list.
 *
 * No setters live here — every mutation surface stays on the
 * orchestrator's `useState` slots.
 */
import { useMemo } from 'react';
import {
  buildEndpoints,
  deriveStatus,
  providerLabel,
  type RowStatus,
  type StatusContext,
} from '../inline-table-view-helpers';
import { type TableRowData } from '../inline-table-view-row';
import { STATUS_ORDER, type GroupBy, type SortCol, type SortDir } from './types';
import { getServiceName } from '../../../assets/icons/service-names';
import type { CardNode } from '../../../store/slices/cards-slice';

export interface UseTableRowsInput {
  activeCard: { nodes?: any[] } | undefined;
  deployedResources: Array<{ node_id: string; provider_id?: string; deployed_at?: string }>;
  driftByNode: Record<string, unknown>;
  nodePipelineStatus: Record<string, unknown>;
  search: string;
  sortCol: SortCol;
  sortDir: SortDir;
  statusFilter: Set<RowStatus>;
  providerFilter: Set<string>;
  groupBy: GroupBy;
  /** Translation function — passed in to keep the hook framework-pure. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export interface UseTableRowsResult {
  rows: TableRowData[];
  sorted: TableRowData[];
  grouped: Array<{ key: string; label: string; rows: TableRowData[] }>;
  counts: Record<RowStatus, number>;
  availableProviders: string[];
}

export function useTableRows(input: UseTableRowsInput): UseTableRowsResult {
  const {
    activeCard,
    deployedResources,
    driftByNode,
    nodePipelineStatus,
    search,
    sortCol,
    sortDir,
    statusFilter,
    providerFilter,
    groupBy,
    t,
  } = input;

  const statusCtx: StatusContext = useMemo(
    () => ({
      nodePipelineStatus: nodePipelineStatus as any,
      driftByNode: driftByNode as any,
      deployedResources: deployedResources as any,
    }),
    [nodePipelineStatus, driftByNode, deployedResources],
  );

  const rows = useMemo<TableRowData[]>(() => {
    if (!activeCard?.nodes) return [];
    return activeCard.nodes.map((n) => {
      const node = n as CardNode;
      const data = node.data || {};
      const iceType = (data.iceType as string) || (node.type as string) || '';
      const provider = (data.provider as string) || '';
      const deployed = deployedResources.find((r) => r.node_id === node.id);
      const status = deriveStatus(node, statusCtx);
      const endpoints = buildEndpoints(node, deployed as any);
      const typeLabel =
        (provider && getServiceName(iceType, provider)) || iceType.split('.').pop() || (node.type as string) || '';
      return {
        node,
        label: (data.label as string) || (data.name as string) || (data.title as string) || typeLabel || node.id,
        typeLabel,
        iceType,
        provider,
        status,
        endpoints,
        providerId: (data.provider_id as string) || deployed?.provider_id || '',
        region: (data.region as string) || '',
        updatedAt: deployed?.deployed_at,
        isChild: !!node.parentId,
      };
    });
  }, [activeCard?.nodes, deployedResources, statusCtx]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (providerFilter.size > 0 && !providerFilter.has(r.provider || 'none')) return false;
      if (q) {
        const hay = `${r.label} ${r.typeLabel} ${r.iceType} ${r.provider} ${r.providerId} ${r.region}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, statusFilter, providerFilter]);

  const sorted = useMemo(() => {
    const v = [...filtered];
    v.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortCol === 'status') {
        av = STATUS_ORDER[a.status];
        bv = STATUS_ORDER[b.status];
      } else if (sortCol === 'updatedAt') {
        av = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        bv = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      } else {
        av = (a[sortCol] || '').toString().toLowerCase();
        bv = (b[sortCol] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return v;
  }, [filtered, sortCol, sortDir]);

  const grouped = useMemo<Array<{ key: string; label: string; rows: TableRowData[] }>>(() => {
    if (groupBy === 'none') return [{ key: '_all', label: '', rows: sorted }];

    const labelFor = (key: string): string => {
      if (groupBy === 'status') return t(`table.status.${key}`);
      if (groupBy === 'provider') return key === 'none' ? t('table.group.noProvider') : providerLabel(key);
      if (groupBy === 'family')
        return key === 'other' ? t('table.group.other') : key.charAt(0).toUpperCase() + key.slice(1);
      if (groupBy === 'group') {
        if (key === '_root') return t('table.group.root');
        const parent = activeCard?.nodes?.find((n) => n.id === key);
        return (parent?.data?.label as string) || key;
      }
      return key;
    };

    const keyFor = (r: TableRowData): string => {
      if (groupBy === 'status') return r.status;
      if (groupBy === 'provider') return r.provider || 'none';
      if (groupBy === 'family') return (r.iceType.split('.')[0] || 'other').toLowerCase();
      if (groupBy === 'group') return r.node.parentId || '_root';
      return '_all';
    };

    const map = new Map<string, TableRowData[]>();
    for (const r of sorted) {
      const k = keyFor(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).map(([key, rows]) => ({ key, label: labelFor(key), rows }));
  }, [sorted, groupBy, t, activeCard?.nodes]);

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = {
      live: 0,
      drifted: 0,
      deploying: 0,
      building: 0,
      queued: 0,
      failed: 0,
      idle: 0,
    };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const availableProviders = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.provider) s.add(r.provider);
    return Array.from(s).sort();
  }, [rows]);

  return { rows, sorted, grouped, counts, availableProviders };
}
