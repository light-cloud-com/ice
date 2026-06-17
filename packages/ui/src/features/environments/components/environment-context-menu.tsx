/**
 * Environment Context Menu — right-click overlay that surfaces deploy /
 * promote / rename / delete actions for the env it was opened over.
 *
 * Extracted verbatim from `environment-tab-bar.tsx` during rf-etabs-3.
 * Renders nothing when env is not found in the supplied list. Promote/
 * rename/delete entries are gated by `is_protected`. Click handlers all
 * close the menu first via the supplied `onClose` callback.
 */

import { ArrowUpRight, Pencil, Rocket, Trash2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from '../../../i18n';
import type { Environment } from '../../../store/slices/environments-slice';

export interface EnvironmentContextMenuProps {
  envId: string;
  x: number;
  y: number;
  environments: ReadonlyArray<Environment>;
  prodEnv: Environment | undefined;
  onDeploy: (env: Environment) => void;
  onPromote: (envId: string) => void;
  onRename: (env: Environment) => void;
  onDelete: (envId: string) => void;
  onClose: () => void;
  /** EI5 — when true, the delete entry is in its "click again to confirm"
   *  armed state. The two-step state is owned by the parent (the tab bar). */
  confirmingDelete?: boolean;
}

export const EnvironmentContextMenu: React.FC<EnvironmentContextMenuProps> = ({
  envId,
  x,
  y,
  environments,
  prodEnv,
  onDeploy,
  onPromote,
  onRename,
  onDelete,
  onClose,
  confirmingDelete = false,
}) => {
  const { t } = useTranslation();
  const env = environments.find((e) => e.id === envId);
  if (!env) return null;
  const showPromote = !env.is_protected && prodEnv;
  const showRename = !env.is_protected;
  const showDelete = !env.is_protected;

  return (
    <div
      className="fixed z-[9999] bg-ice-surface border border-ice-border rounded-md shadow-lg py-1 min-w-[170px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Deploy — available for all environments */}
      <button
        onClick={() => {
          onClose();
          onDeploy(env);
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
      >
        <Rocket className="w-3.5 h-3.5" />
        {t('environments.tabBar.contextDeploy')}
      </button>
      {showPromote && (
        <button
          onClick={() => onPromote(envId)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          {t('environments.tabBar.contextPromote')}
        </button>
      )}
      {showRename && (
        <button
          onClick={() => {
            onClose();
            onRename(env);
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-ice-text-2 hover:bg-ice-hover transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          {t('environments.tabBar.contextRename')}
        </button>
      )}
      {showDelete && (
        <>
          <div className="h-px bg-ice-border my-1" />
          <button
            onClick={() => onDelete(envId)}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-ice-xs text-red-400 transition-colors ${
              confirmingDelete ? 'bg-red-500/15 font-medium' : 'hover:bg-red-500/10'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmingDelete ? t('environments.tabBar.contextDeleteConfirm') : t('environments.tabBar.contextDelete')}
          </button>
        </>
      )}
    </div>
  );
};
