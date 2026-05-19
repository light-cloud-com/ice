/**
 * Connection Card — visual representation of a single edge between two nodes
 * in the canvas. Renders the source-node icon + label, an arrow with either a
 * `:port` or a relationship label, the target-node icon + label, and a delete
 * button that appears on hover. Used in the connections tab of the properties
 * panel (one card per edge).
 *
 * Pure presentational: takes `dispatch` as a prop instead of calling
 * `useDispatch` internally. The icon-or-initial fallback resolves through
 * `getIcon(iceType, provider)` from `assets/icons`; when the lookup returns
 * null, the source/target type's last `.`-segment first character is shown.
 *
 * Extracted verbatim from `properties-panel.tsx` during rf-props-12. Tailwind
 * class strings, the `'aws'` default provider, the `'Unknown'` default label,
 * and the port-then-relationship priority (port wins when set; otherwise
 * `connectionCategory` wins over `relationship`) are all preserved exactly.
 */

import React from 'react';
import { getIcon } from '../../../../assets/icons';
import { t } from '../../../../i18n';
import {
  deleteCardEdge,
  type CardEdge,
  type CardNode,
} from '../../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../../store';

// ─── Visual Connection Card ─────────────────────────────────────────────────

export const ConnectionCard: React.FC<{
  edge: CardEdge;
  thisNodeId: string;
  nodes: CardNode[];
  dispatch: AppDispatch;
}> = ({ edge, thisNodeId: _thisNodeId, nodes, dispatch }) => {
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = (sourceNode?.data?.label as string) || 'Unknown';
  const targetLabel = (targetNode?.data?.label as string) || 'Unknown';
  const sourceType = (sourceNode?.data?.iceType as string) || '';
  const targetType = (targetNode?.data?.iceType as string) || '';
  const sourceProvider = (sourceNode?.data?.provider as string) || 'aws';
  const targetProvider = (targetNode?.data?.provider as string) || 'aws';
  const d = edge.data || {};
  const port = d.port != null ? String(d.port) : '';
  const relationship = (d.connectionCategory as string) || (d.relationship as string) || '';

  const sourceIcon = getIcon(sourceType, sourceProvider as any);
  const targetIcon = getIcon(targetType, targetProvider as any);

  return (
    <div className="group flex items-center gap-0 py-3 px-1">
      {/* FROM node */}
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="w-9 h-9 flex items-center justify-center mb-1.5">
          {sourceIcon ? (
            <img src={sourceIcon.icon} alt="" className="w-7 h-7" />
          ) : (
            <span className="text-ice-sm text-ice-text-3 font-semibold">
              {sourceType.split('.').pop()?.charAt(0) || '?'}
            </span>
          )}
        </div>
        <span className="text-ice-xs font-medium text-ice-text-1 truncate max-w-full text-center">{sourceLabel}</span>
      </div>

      {/* Arrow with port */}
      <div className="flex flex-col items-center shrink-0 px-1.5 gap-0.5">
        <div className="flex items-center gap-0.5">
          <div className="w-8 h-px bg-ice-text-3" />
          <div className="w-0 h-0 border-l-[5px] border-l-ice-text-3 border-y-[3px] border-y-transparent" />
        </div>
        {port && <span className="text-ice-2xs font-mono text-ice-accent">:{port}</span>}
        {!port && relationship && <span className="text-ice-2xs text-ice-text-3">{relationship}</span>}
      </div>

      {/* TO node */}
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div className="w-9 h-9 flex items-center justify-center mb-1.5">
          {targetIcon ? (
            <img src={targetIcon.icon} alt="" className="w-7 h-7" />
          ) : (
            <span className="text-ice-sm text-ice-text-3 font-semibold">
              {targetType.split('.').pop()?.charAt(0) || '?'}
            </span>
          )}
        </div>
        <span className="text-ice-xs font-medium text-ice-text-1 truncate max-w-full text-center">{targetLabel}</span>
      </div>

      {/* Delete button */}
      <button
        onClick={() => dispatch(deleteCardEdge(edge.id))}
        className="ml-1 p-1 text-ice-text-3 hover:text-red-400 transition-colors shrink-0 rounded opacity-0 group-hover:opacity-100"
        title={t('properties.removeConnection')}
      >
        &times;
      </button>
    </div>
  );
};
