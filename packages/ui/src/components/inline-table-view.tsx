/**
 * Inline Table View — reads nodes/edges from Redux (same as canvas)
 *
 * Shows the exact same elements as the canvas in a sortable table.
 * Clicking a row selects the node (same selection as canvas).
 */

import React, { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { selectActiveCard } from '../store/slices/cards-slice';
import { setSelectedNodes } from '../store/slices/selection-slice';
import { toggleProperties } from '../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../store';

type SortCol = 'label' | 'iceType' | 'category' | 'provider' | 'behavior';
type SortDir = 'asc' | 'desc';

interface Row {
  id: string;
  nodeType: string;
  label: string;
  iceType: string;
  category: string;
  provider: string;
  behavior: string;
  parentId?: string;
  x: number;
  y: number;
}

export const InlineTableView: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const selectedNodes = useSelector((s: RootState) => s.selection.selectedNodes);
  const [sortCol, setSortCol] = useState<SortCol>('label');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const rows = useMemo<Row[]>(() => {
    if (!activeCard?.nodes) return [];
    return activeCard.nodes.map((n: any) => ({
      id: n.id,
      nodeType: n.type || 'resource',
      label: n.data?.label || n.id,
      iceType: n.data?.iceType || n.type || '',
      category: n.data?.iceType?.split('.')[0] || '',
      provider: n.data?.provider || '',
      behavior: n.data?.behavior || 'singleton',
      parentId: n.parentId,
      x: Math.round(n.position?.x || 0),
      y: Math.round(n.position?.y || 0),
    }));
  }, [activeCard?.nodes]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a[sortCol] || '').toLowerCase();
      const bv = (b[sortCol] || '').toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [rows, sortCol, sortDir]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const showProperties = useSelector((s: RootState) => s.ui.showProperties);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      const next = selectedNodes.includes(id)
        ? selectedNodes.filter((n) => n !== id)
        : [...selectedNodes, id];
      dispatch(setSelectedNodes(next));
    } else {
      dispatch(setSelectedNodes([id]));
    }
    // Auto-open properties panel
    if (!showProperties) {
      dispatch(toggleProperties());
    }
  };

  const SortHeader: React.FC<{ col: SortCol; label: string; className?: string }> = ({ col, label, className }) => {
    const isActive = sortCol === col;
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 text-left text-ice-sm font-medium uppercase tracking-wider transition-colors ${
          isActive ? 'text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-2'
        } ${className || ''}`}
      >
        {label}
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col bg-ice-base">
      {/* Header */}
      <div className="grid grid-cols-[1fr_140px_100px_90px_80px_60px_60px] gap-2 px-4 py-2 border-b border-ice-border bg-ice-raised shrink-0">
        <SortHeader col="label" label="Name" />
        <SortHeader col="iceType" label="Type" />
        <SortHeader col="category" label="Category" />
        <SortHeader col="provider" label="Provider" />
        <SortHeader col="behavior" label="Behavior" />
        <span className="text-ice-sm font-medium text-ice-text-3 uppercase tracking-wider">X</span>
        <span className="text-ice-sm font-medium text-ice-text-3 uppercase tracking-wider">Y</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sorted.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-ice-text-3 text-sm">No resources yet</p>
            <p className="text-ice-text-3 text-xs mt-1">Drag blocks from the sidebar to add resources</p>
          </div>
        ) : (
          sorted.map((row) => {
            const isSelected = selectedNodes.includes(row.id);
            return (
              <div
                key={row.id}
                onClick={(e) => handleRowClick(row.id, e)}
                className={`grid grid-cols-[1fr_140px_100px_90px_80px_60px_60px] gap-2 px-4 py-1.5 border-b border-ice-border cursor-pointer transition-colors ${
                  isSelected ? 'bg-ice-accent-muted' : 'hover:bg-ice-hover'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {row.parentId && <span className="text-ice-text-3 text-ice-xs">↳</span>}
                  <span className="text-ice-md text-ice-text-1 truncate">{row.label}</span>
                </div>
                <span className="text-ice-sm text-ice-text-2 font-mono truncate">{row.iceType}</span>
                <span className="text-ice-sm text-ice-text-3 capitalize">{row.category}</span>
                <span className="text-ice-sm text-ice-text-3 uppercase">{row.provider || '—'}</span>
                <span className="text-ice-sm text-ice-text-3">{row.behavior}</span>
                <span className="text-ice-sm text-ice-text-3 tabular-nums">{row.x}</span>
                <span className="text-ice-sm text-ice-text-3 tabular-nums">{row.y}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-ice-border bg-ice-raised shrink-0">
        <span className="text-ice-xs text-ice-text-3 tabular-nums">{rows.length} resources</span>
        {selectedNodes.length > 0 && (
          <span className="text-ice-xs text-ice-accent tabular-nums">{selectedNodes.length} selected</span>
        )}
      </div>
    </div>
  );
};
