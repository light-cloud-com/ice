/**
 * rf-ppanel-6 — TriggerRow.
 *
 * One row inside the Triggers section: enable toggle, trigger-type label,
 * branch select, environment select, delete button. The branch select
 * falls back to a fixed list (`main`/`master`/`*`) when no branches have
 * loaded yet, and ALSO injects the current `branch_pattern` as an option
 * if it isn't already in the loaded list.
 *
 * Stateless — owns no state, fires onToggle/onChangeBranch/onChangeEnvironment/
 * onDelete to the parent for every input change.
 */

import { Trash2, ArrowRight } from 'lucide-react';
import React from 'react';

import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { DeploymentRule } from '../../../store/slices/pipeline-slice';

export interface BranchInfo {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface TriggerRowProps {
  rule: DeploymentRule;
  branches: BranchInfo[];
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onChangeBranch: (branch: string) => void;
  onChangeEnvironment: (env: string) => void;
}

export const TriggerRow: React.FC<TriggerRowProps> = ({
  rule,
  branches,
  onToggle,
  onDelete,
  onChangeBranch,
  onChangeEnvironment,
}) => {
  const { t } = useTranslation();
  // Ensure current branch_pattern is in the list
  const branchNames = branches.map((b) => b.name);
  const currentInList = branchNames.includes(rule.branch_pattern) || rule.branch_pattern === '*';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
        rule.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 bg-ice-base opacity-60',
      )}
    >
      {/* Toggle */}
      <button
        onClick={() => onToggle(!rule.enabled)}
        className={cn(
          'w-7 h-4 rounded-full relative transition-colors flex-shrink-0',
          rule.enabled ? 'bg-emerald-500' : 'bg-ice-border',
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
            rule.enabled ? 'left-3.5' : 'left-0.5',
          )}
        />
      </button>

      {/* Trigger type + branch */}
      <span className="text-ice-text-2 text-xs">
        {rule.trigger_type === 'merge' ? t('pipeline.mergeTo') : t('pipeline.pushTo')}
      </span>
      <select
        value={rule.branch_pattern}
        onChange={(e) => onChangeBranch(e.target.value)}
        className="px-1.5 py-0.5 text-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono max-w-[100px]"
      >
        {branches.length > 0 ? (
          <>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.protected ? ` ${t('pipeline.branchProtected')}` : ''}
              </option>
            ))}
            <option value="*">{t('pipeline.anyBranch')}</option>
          </>
        ) : (
          <>
            {/* Fallback while loading */}
            {!currentInList && rule.branch_pattern !== '*' && (
              <option value={rule.branch_pattern}>{rule.branch_pattern}</option>
            )}
            <option value="main">main</option>
            <option value="master">master</option>
            <option value="*">{t('pipeline.anyBranch')}</option>
          </>
        )}
      </select>

      <ArrowRight className="w-3 h-3 text-ice-text-3 flex-shrink-0" />

      {/* Environment */}
      <select
        value={rule.environment}
        onChange={(e) => onChangeEnvironment(e.target.value)}
        className="px-1.5 py-0.5 text-xs rounded border border-ice-border bg-ice-base text-ice-text-1"
      >
        <option value="production">{t('pipeline.envProduction')}</option>
        <option value="staging">{t('pipeline.envStaging')}</option>
        <option value="development">{t('pipeline.envDevelopment')}</option>
      </select>

      {/* Delete */}
      <button onClick={onDelete} className="ml-auto p-0.5 text-ice-text-3 hover:text-red-500 transition-colors">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};
