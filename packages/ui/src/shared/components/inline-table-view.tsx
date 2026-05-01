/**
 * Inline Table View — reads nodes/edges from Redux (same as canvas)
 *
 * Sortable, searchable, filterable table over the active card's nodes.
 * Click a row to select + open properties (matches the canvas).
 *
 * Editing lives in the properties panel — every cell here is read-only.
 */

import { ChevronDown, Filter as FilterIcon, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  buildEndpoints,
  deriveStatus,
  STATUS_COLORS,
  providerLabel,
  type RowStatus,
  type StatusContext,
} from './inline-table-view-helpers';
import { InlineTableRow, type TableRowData } from './inline-table-view-row';
import { FilterChip } from './inline-table-view/filter-chip';
import { SortHeader } from './inline-table-view/sort-header';
import { ALL_STATUSES, STATUS_ORDER, type Density, type GroupBy, type SortCol, type SortDir } from './inline-table-view/types';
import { SearchInput } from './ui/search-input';
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

  // ─── Filter chip helper (preserves the original key+component shape) ───

  const filterChip = (key: string, active: boolean, label: string, onClick: () => void, dot?: string) => (
    <FilterChip key={key} active={active} label={label} onClick={onClick} dot={dot} />
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
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ice-border bg-ice-raised shrink-0">
        <SearchInput value={search} onChange={setSearch} placeholder={t('table.search.placeholder')} className="w-64" />

        <div className="flex items-center gap-1 ml-1">
          <FilterIcon className="w-3 h-3 text-ice-text-3" />
          {ALL_STATUSES.filter((s) => counts[s] > 0).map((s) =>
            filterChip(
              `status-${s}`,
              statusFilter.has(s),
              `${t(`table.status.${s}`)} ${counts[s]}`,
              () => toggleStatus(s),
              STATUS_COLORS[s].dot,
            ),
          )}
        </div>

        {availableProviders.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="w-px h-4 bg-ice-border mx-1" />
            {availableProviders.map((p) =>
              filterChip(`provider-${p}`, providerFilter.has(p), providerLabel(p), () => toggleProvider(p)),
            )}
          </div>
        )}

        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-ice-2xs text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-active"
          >
            <X className="w-3 h-3" />
            {t('table.filter.clear')}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Group by */}
          <label className="flex items-center gap-1.5 text-ice-2xs text-ice-text-3">
            {t('table.groupBy.label')}
            <div className="relative">
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="appearance-none pl-2 pr-6 py-0.5 rounded border border-ice-border bg-ice-raised text-ice-text-1 text-ice-2xs focus:outline-none focus:border-ice-border-strong"
              >
                <option value="none">{t('table.groupBy.none')}</option>
                <option value="status">{t('table.groupBy.status')}</option>
                <option value="provider">{t('table.groupBy.provider')}</option>
                <option value="family">{t('table.groupBy.family')}</option>
                <option value="group">{t('table.groupBy.group')}</option>
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ice-text-3 pointer-events-none" />
            </div>
          </label>

          {/* Density */}
          <div className="flex items-center rounded border border-ice-border overflow-hidden text-ice-2xs">
            <button
              onClick={() => setDensity('comfortable')}
              className={`px-1.5 py-0.5 ${density === 'comfortable' ? 'bg-ice-accent-muted text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-1'}`}
            >
              {t('table.density.comfortable')}
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={`px-1.5 py-0.5 border-l border-ice-border ${density === 'compact' ? 'bg-ice-accent-muted text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-1'}`}
            >
              {t('table.density.compact')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Column header (above the scrolling body) ─────────────────────── */}
      <div className="grid grid-cols-[12px_1fr_140px_110px_120px_140px_180px_90px_36px] items-center gap-2 px-3 py-1.5 border-b border-ice-border bg-ice-raised shrink-0">
        <span />
        <SortHeader col="label" label={t('table.columns.name')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <SortHeader col="typeLabel" label={t('table.columns.type')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <SortHeader col="provider" label={t('table.columns.provider')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <SortHeader col="status" label={t('table.columns.status')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <span className="text-ice-2xs font-medium text-ice-text-3 uppercase tracking-wider">
          {t('table.columns.endpoints')}
        </span>
        <SortHeader col="providerId" label={t('table.columns.id')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <SortHeader col="updatedAt" label={t('table.columns.updated')} sortCol={sortCol} sortDir={sortDir} onToggleSort={toggleSort} />
        <span />
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-ice-text-3 text-sm">
              {rows.length === 0 ? t('table.noResources') : t('table.empty.noResults')}
            </p>
            <p className="text-ice-text-3 text-xs mt-1">
              {rows.length === 0 ? t('table.noResourcesHint') : t('table.empty.noResultsHint')}
            </p>
          </div>
        ) : (
          grouped.map((g) => (
            <React.Fragment key={g.key}>
              {groupBy !== 'none' && (
                <div className="px-3 py-1 bg-ice-raised border-b border-ice-border text-ice-2xs uppercase tracking-wider text-ice-text-3 sticky top-0 z-10">
                  {g.label} <span className="text-ice-text-3/60">· {g.rows.length}</span>
                </div>
              )}
              {g.rows.map((row, idx) => (
                <InlineTableRow
                  key={`${row.node.id}-${idx}`}
                  row={row}
                  density={density}
                  isSelected={selectedNodes.includes(row.node.id)}
                  isExpanded={expanded.has(row.node.id)}
                  onToggleExpand={() => toggleExpand(row.node.id)}
                  onClick={(e) => selectRow(row.node.id, e)}
                  onCopyId={() => navigator.clipboard.writeText(row.providerId || row.node.id)}
                  onCopyName={() => navigator.clipboard.writeText(row.label)}
                  onRevealOnCanvas={() => revealOnCanvas(row.node.id)}
                  onOpenProperties={() => openProperties(row.node.id)}
                  onDelete={() => deleteRow(row.node.id)}
                />
              ))}
            </React.Fragment>
          ))
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-ice-border bg-ice-raised shrink-0 text-ice-2xs">
        <span className="text-ice-text-3 tabular-nums">
          {sorted.length === rows.length
            ? t('table.footer.total', { count: rows.length })
            : t('table.footer.filtered', { shown: sorted.length, total: rows.length })}
        </span>
        {selectedNodes.length > 0 && (
          <span className="text-ice-accent tabular-nums">
            {t('table.footer.selected', { count: selectedNodes.length })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {ALL_STATUSES.filter((s) => counts[s] > 0).map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`inline-flex items-center gap-1 px-1 py-0.5 rounded text-ice-text-3 hover:text-ice-text-1 ${
                statusFilter.has(s) ? 'text-ice-text-1' : ''
              }`}
              title={t(`table.status.${s}`)}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[s].dot }} />
              <span className="tabular-nums">{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
