/**
 * Validation Panel
 *
 * Right sidebar panel listing all validation issues.
 * Clicking an issue selects the affected node on the canvas.
 */

import React, { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { setSelectedNodes } from '../../../store/slices/selection-slice';
import type { RootState } from '../../../store';
import type { CanvasIssue } from '../../../store/slices/validation-slice';

export const ValidationPanel: React.FC = () => {
  const dispatch = useDispatch();
  const { issues, valid, summary } = useSelector((state: RootState) => state.validation);

  const errorIssues = useMemo(() => issues.filter((i: CanvasIssue) => i.severity === 'error'), [issues]);
  const warningIssues = useMemo(() => issues.filter((i: CanvasIssue) => i.severity === 'warning'), [issues]);
  const infoIssues = useMemo(() => issues.filter((i: CanvasIssue) => i.severity === 'info'), [issues]);

  const handleClick = (issue: CanvasIssue) => {
    if (issue.nodeId) {
      dispatch(setSelectedNodes([issue.nodeId]));
    }
  };

  return (
    <div className="h-full flex flex-col bg-ice-surface text-ice-text-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ice-border">
        <ShieldCheck className="w-4 h-4 text-ice-text-3" />
        <span className="text-sm font-semibold">Validation</span>
        <div className="flex-1" />
        {summary.errors > 0 && (
          <span className="text-ice-2xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
            {summary.errors}
          </span>
        )}
        {summary.warnings > 0 && (
          <span className="text-ice-2xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
            {summary.warnings}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {valid && issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-ice-text-3/60 px-4">
            <CheckCircle className="w-8 h-8 text-emerald-500/40" />
            <span className="text-sm">No issues found</span>
          </div>
        ) : (
          <>
            {errorIssues.length > 0 && (
              <IssueGroup label="Errors" issues={errorIssues} onClick={handleClick} />
            )}
            {warningIssues.length > 0 && (
              <IssueGroup label="Warnings" issues={warningIssues} onClick={handleClick} />
            )}
            {infoIssues.length > 0 && (
              <IssueGroup label="Info" issues={infoIssues} onClick={handleClick} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

const IssueGroup: React.FC<{
  label: string;
  issues: CanvasIssue[];
  onClick: (issue: CanvasIssue) => void;
}> = ({ label, issues, onClick }) => (
  <div>
    <div className="px-3 py-1.5 text-ice-2xs font-medium text-ice-text-3/60 uppercase tracking-wider bg-ice-bg-raised/30">
      {label} ({issues.length})
    </div>
    {issues.map(issue => (
      <button
        key={issue.id}
        onClick={() => onClick(issue)}
        className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-ice-bg-raised/50 transition-colors border-b border-ice-border/20"
      >
        <AlertTriangle
          className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
            issue.severity === 'error'
              ? 'text-red-400'
              : issue.severity === 'warning'
                ? 'text-amber-400'
                : 'text-ice-text-3/40'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs leading-snug">{issue.message}</div>
          {issue.suggestion && (
            <div className="text-ice-2xs text-ice-text-3/50 leading-snug mt-0.5">{issue.suggestion}</div>
          )}
          <div className="text-[10px] text-ice-text-3/30 mt-0.5 uppercase">{issue.category}</div>
        </div>
      </button>
    ))}
  </div>
);
