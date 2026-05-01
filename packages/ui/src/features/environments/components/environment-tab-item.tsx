/**
 * Environment Tab Item — single tab button in the EnvironmentTabBar.
 *
 * Extracted verbatim from `environment-tab-bar.tsx` during rf-etabs-3.
 * Renders the deploy-status dot, name, optional deployed-URL link, lock
 * icon for protected environments, and PR badge for `pr` envs. Forwards
 * onClick to switch the active env and onContextMenu to open the menu.
 */

import { GitPullRequest, Lock } from 'lucide-react';
import React from 'react';
import { cn } from '../../../shared/utils/cn';
import type { Environment } from '../../../store/slices/environments-slice';
import { getDeployStatusDotColor } from '../utils/deploy-status-color';

export interface EnvironmentDeployStatus {
  status: string;
  url?: string;
}

export interface EnvironmentTabItemProps {
  env: Environment;
  isActive: boolean;
  deployStatus: EnvironmentDeployStatus | undefined;
  onSwitch: (env: Environment) => void;
  onContextMenu: (e: React.MouseEvent, envId: string) => void;
}

export const EnvironmentTabItem: React.FC<EnvironmentTabItemProps> = ({
  env,
  isActive,
  deployStatus,
  onSwitch,
  onContextMenu,
}) => {
  const dotColor = getDeployStatusDotColor(deployStatus);

  return (
    <button
      onClick={() => onSwitch(env)}
      onContextMenu={(e) => onContextMenu(e, env.id)}
      title={deployStatus?.url || env.name}
      className={cn(
        'flex items-center gap-1 px-2.5 py-1 text-ice-xs font-medium rounded transition-colors',
        isActive
          ? 'bg-ice-active text-ice-text-1'
          : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
      )}
    >
      {/* Status dot — reflects real deploy status */}
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />

      {/* Name */}
      {env.name}

      {/* Deployed URL — shown as a small link icon when available */}
      {deployStatus?.url && isActive && (
        <a
          href={deployStatus.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-ice-2xs text-blue-400 hover:text-blue-300 truncate max-w-[100px]"
          title={deployStatus.url}
        >
          {deployStatus.url.replace(/^https?:\/\//, '').slice(0, 20)}
        </a>
      )}

      {/* Lock icon for production */}
      {env.is_protected && <Lock className="w-2.5 h-2.5 text-ice-text-3" />}

      {/* PR badge */}
      {env.type === 'pr' && env.pr_number && (
        <span className="flex items-center gap-0.5 text-ice-2xs text-purple-400">
          <GitPullRequest className="w-2.5 h-2.5" />#{env.pr_number}
        </span>
      )}
    </button>
  );
};
