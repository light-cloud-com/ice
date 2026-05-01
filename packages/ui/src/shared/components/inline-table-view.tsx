/**
 * Inline Table View — reads nodes/edges from Redux (same as canvas)
 *
 * Sortable, searchable, filterable table over the active card's nodes.
 * Click a row to select + open properties (matches the canvas).
 *
 * Editing lives in the properties panel — every cell here is read-only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { type RowStatus } from './inline-table-view-helpers';
import { ColumnHeader } from './inline-table-view/column-header';
import { TableBody } from './inline-table-view/table-body';
import { TableFooter } from './inline-table-view/table-footer';
import { Toolbar } from './inline-table-view/toolbar';
import { type Density, type GroupBy, type SortCol, type SortDir } from './inline-table-view/types';
import { useTableRows } from './inline-table-view/use-table-rows';
import { useTranslation } from '../../i18n';
import { selectActiveCard, deleteCardNode } from '../../store/slices/cards-slice';
import { setSelectedNodes } from '../../store/slices/selection-slice';
import { toggleProperties } from '../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../store';

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

  // ─── Data pipeline (rows / sorted / grouped / counts / providers) ──────

  const { rows, sorted, grouped, counts, availableProviders } = useTableRows({
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
  });

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
