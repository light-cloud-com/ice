/**
 * ValidationStatusBar
 *
 * Thin bar at the bottom of the canvas showing validation summary.
 * Clicking expands to show the full issues list.
 */

import { AlertTriangle, CheckCircle, ChevronUp, ChevronDown, X } from 'lucide-react';
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { setSelectedNodes } from '../../../store/slices/selection-slice';
import type { RootState } from '../../../store';
import type { CanvasIssue } from '../../../store/slices/validation-slice';

export const ValidationStatusBar: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const dispatch = useDispatch();

  const { issues, valid, summary, validatedAt } = useSelector((state: RootState) => state.validation);
  const activeCard = useSelector(selectActiveCard);
  const nodeCount = activeCard?.nodes?.length ?? 0;

  // Don't show if no nodes on canvas
  if (nodeCount === 0) return null;

  const { errors, warnings } = summary;
  const hasIssues = errors > 0 || warnings > 0;

  // Non-info issues for the expanded list
  const visibleIssues = issues.filter((i) => i.severity !== 'info');

  const handleIssueClick = (issue: CanvasIssue) => {
    if (issue.nodeId) {
      dispatch(setSelectedNodes([issue.nodeId]));
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-auto">
      {/* Expanded panel */}
      {expanded && visibleIssues.length > 0 && (
        <div className="bg-ice-bg-surface/95 backdrop-blur-md border-t border-ice-border max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-ice-border/50">
            <span className="text-ice-2xs font-medium text-ice-text-2">Validation Issues ({visibleIssues.length})</span>
            <button onClick={() => setExpanded(false)} className="p-0.5 hover:bg-ice-bg-raised rounded">
              <X className="w-3 h-3 text-ice-text-3" />
            </button>
          </div>
          {visibleIssues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => handleIssueClick(issue)}
              className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-ice-bg-raised/50 transition-colors"
            >
              <span
                className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                  issue.severity === 'error' ? 'bg-red-400' : 'bg-amber-400'
                }`}
              />
              <div className="min-w-0">
                <div className="text-ice-2xs text-ice-text-2 truncate">{issue.message}</div>
                {issue.suggestion && <div className="text-ice-2xs text-ice-text-3/60 truncate">{issue.suggestion}</div>}
              </div>
              <span className="ml-auto flex-shrink-0 text-ice-2xs text-ice-text-3/40 uppercase">{issue.category}</span>
            </button>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div
        className={`flex items-center gap-3 px-3 py-1 border-t text-ice-2xs cursor-pointer select-none transition-colors ${
          hasIssues
            ? errors > 0
              ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
              : 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10'
            : 'bg-ice-bg-surface/80 border-ice-border hover:bg-ice-bg-raised/50'
        }`}
        onClick={() => hasIssues && setExpanded(!expanded)}
      >
        {/* Status icon */}
        {hasIssues ? (
          <AlertTriangle className={`w-3 h-3 flex-shrink-0 ${errors > 0 ? 'text-red-400' : 'text-amber-400'}`} />
        ) : (
          <CheckCircle className="w-3 h-3 flex-shrink-0 text-emerald-400" />
        )}

        {/* Summary text */}
        <span className="text-ice-text-2">
          {errors > 0 && (
            <span className="text-red-400 font-medium">
              {errors} error{errors > 1 ? 's' : ''}
            </span>
          )}
          {errors > 0 && warnings > 0 && <span className="text-ice-text-3 mx-1">·</span>}
          {warnings > 0 && (
            <span className="text-amber-400">
              {warnings} warning{warnings > 1 ? 's' : ''}
            </span>
          )}
          {!hasIssues && <span className="text-emerald-400">Valid</span>}
        </span>

        {/* Expand arrow */}
        {hasIssues && (
          <div className="ml-auto">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-ice-text-3" />
            ) : (
              <ChevronUp className="w-3 h-3 text-ice-text-3" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
