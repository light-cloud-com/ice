/**
 * Scrollable body section. Renders an empty state when there are no
 * rows / no matches, otherwise the grouped row sections with each
 * `<InlineTableRow>` wired into the orchestrator's selection +
 * navigation handlers.
 *
 * Extracted from `inline-table-view.tsx` (rf-itab-2).
 */
import React from 'react';
import { InlineTableRow, type TableRowData } from '../inline-table-view-row';
import type { Density, GroupBy } from './types';
import { useTranslation } from '../../../i18n';

export interface RowGroup {
  key: string;
  label: string;
  rows: TableRowData[];
}

export interface TableBodyProps {
  sorted: TableRowData[];
  rows: TableRowData[];
  grouped: RowGroup[];
  density: Density;
  groupBy: GroupBy;
  selectedNodes: string[];
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectRow: (id: string, e: React.MouseEvent) => void;
  onCopyId: (row: TableRowData) => void;
  onCopyName: (row: TableRowData) => void;
  onRevealOnCanvas: (id: string) => void;
  onOpenProperties: (id: string) => void;
  onDeleteRow: (id: string) => void;
}

export const TableBody: React.FC<TableBodyProps> = ({
  sorted,
  rows,
  grouped,
  density,
  groupBy,
  selectedNodes,
  expanded,
  onToggleExpand,
  onSelectRow,
  onCopyId,
  onCopyName,
  onRevealOnCanvas,
  onOpenProperties,
  onDeleteRow,
}) => {
  const { t } = useTranslation();
  return (
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
                onToggleExpand={() => onToggleExpand(row.node.id)}
                onClick={(e) => onSelectRow(row.node.id, e)}
                onCopyId={() => onCopyId(row)}
                onCopyName={() => onCopyName(row)}
                onRevealOnCanvas={() => onRevealOnCanvas(row.node.id)}
                onOpenProperties={() => onOpenProperties(row.node.id)}
                onDelete={() => onDeleteRow(row.node.id)}
              />
            ))}
          </React.Fragment>
        ))
      )}
    </div>
  );
};
