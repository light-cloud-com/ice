/**
 * Inline Table View — reads nodes/edges from Redux (same as canvas)
 *
 * Sortable, searchable, filterable table over the active card's nodes.
 * Click a row to select + open properties (matches the canvas).
 *
 * Editing lives in the properties panel — every cell here is read-only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  buildEndpoints,
  deriveStatus,
  providerLabel,
  type RowStatus,
  type StatusContext,
} from './inline-table-view-helpers';
import { type TableRowData } from './inline-table-view-row';
import { ColumnHeader } from './inline-table-view/column-header';
import { TableBody } from './inline-table-view/table-body';
import { TableFooter } from './inline-table-view/table-footer';
import { Toolbar } from './inline-table-view/toolbar';
import { STATUS_ORDER, type Density, type GroupBy, type SortCol, type SortDir } from './inline-table-view/types';
import { getServiceName } from '../../assets/icons/service-names';
import { useTranslation } from '../../i18n';
import { selectActiveCard, deleteCardNode } from '../../store/slices/cards-slice';
import { setSelectedNodes } from '../../store/slices/selection-slice';
import { toggleProperties } from '../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../store';
import type { CardNode } from '../../store/slices/cards-slice';

// ─── Component ──────────────────────────────────────────────────────────────

export const InlineTableView: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeCard = useSelector(selectActiveCard);
  const selectedNodes = useSelector((s: RootState) => s.selection.selectedNodes);
  const showProperties = useSelector((s: RootState) => s.ui.showProperties);

  const deployedResources = useSelector((s: RootState) => s.deploy.deployedResources);
  const driftByNode = useSelector((s: RootState) => s.deploy.driftByNode);
  const nodePipelineStatus = useSelector((s: RootState) => s.pipeline.nodeStatus);

  // ─── Local UI state ─────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('label');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<Set<RowStatus>>(new Set());
  const [providerFilter, setProviderFilter] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [density, setDensity] = useState<Density>('comfortable');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // ─── Build rows ─────────────────────────────────────────────────────────

  const statusCtx: StatusContext = useMemo(
    () => ({ nodePipelineStatus, driftByNode, deployedResources }),
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
      const endpoints = buildEndpoints(node, deployed);
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

  // ─── Filter ─────────────────────────────────────────────────────────────

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

  // ─── Sort ───────────────────────────────────────────────────────────────

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

  // ─── Group ──────────────────────────────────────────────────────────────

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

  // ─── Counts (for footer) ────────────────────────────────────────────────

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

  // ─── Handlers ───────────────────────────────────────────────────────────

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const toggleStatus = (s: RowStatus) =>
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const toggleProvider = (p: string) =>
    setProviderFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const clearFilters = () => {
    setSearch('');
    setStatusFilter(new Set());
    setProviderFilter(new Set());
  };

  const selectRow = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const next = selectedNodes.includes(id) ? selectedNodes.filter((n) => n !== id) : [...selectedNodes, id];
        dispatch(setSelectedNodes(next));
      } else {
        dispatch(setSelectedNodes([id]));
      }
      if (!showProperties) dispatch(toggleProperties());
    },
    [dispatch, selectedNodes, showProperties],
  );

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const revealOnCanvas = useCallback(
    (id: string) => {
      dispatch(setSelectedNodes([id]));
      // strip "/table" suffix to land on the canvas view of the same project
      const canvasPath = pathname.endsWith('/table') ? pathname.slice(0, -'/table'.length) : pathname;
      navigate(canvasPath);
    },
    [dispatch, navigate, pathname],
  );

  const openProperties = useCallback(
    (id: string) => {
      dispatch(setSelectedNodes([id]));
      if (!showProperties) dispatch(toggleProperties());
    },
    [dispatch, showProperties],
  );

  const deleteRow = useCallback(
    (id: string) => {
      dispatch(deleteCardNode(id));
    },
    [dispatch],
  );

  const hasActiveFilter = search.length > 0 || statusFilter.size > 0 || providerFilter.size > 0;

  // Close any expanded rows when underlying nodes disappear
  useEffect(() => {
    const ids = new Set((activeCard?.nodes || []).map((n) => n.id));
    setExpanded((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeCard?.nodes]);

  return (
    <div className="h-full flex flex-col bg-ice-base">
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        providerFilter={providerFilter}
        counts={counts}
        availableProviders={availableProviders}
        hasActiveFilter={hasActiveFilter}
        groupBy={groupBy}
        density={density}
        onToggleStatus={toggleStatus}
        onToggleProvider={toggleProvider}
        onClearFilters={clearFilters}
        onGroupByChange={setGroupBy}
        onDensityChange={setDensity}
      />

      <ColumnHeader sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />

      <TableBody
        sorted={sorted}
        rows={rows}
        grouped={grouped}
        density={density}
        groupBy={groupBy}
        selectedNodes={selectedNodes}
        expanded={expanded}
        onToggleExpand={toggleExpand}
        onSelectRow={selectRow}
        onCopyId={(row) => navigator.clipboard.writeText(row.providerId || row.node.id)}
        onCopyName={(row) => navigator.clipboard.writeText(row.label)}
        onRevealOnCanvas={revealOnCanvas}
        onOpenProperties={openProperties}
        onDeleteRow={deleteRow}
      />

      <TableFooter
        sortedCount={sorted.length}
        totalCount={rows.length}
        selectedCount={selectedNodes.length}
        counts={counts}
        statusFilter={statusFilter}
        onToggleStatus={toggleStatus}
      />
    </div>
  );
};
