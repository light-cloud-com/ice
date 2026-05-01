/**
 * Project Tree — Environment row.
 *
 * Extracted verbatim from `./project-tree.tsx` (rf-ptree-5). Renders one
 * environment leaf inside a Project. The previous inline `renderEnvironment`
 * helper closed over orchestrator state (`activeEnvId`, `activeProjectId`,
 * `deployingCardId`, `deployStatus`, `handleEnvClick`); it's now a proper
 * FC with explicit props so the orchestrator can decouple "what data this
 * row needs" from "where the data comes from."
 *
 * Behavior preserved verbatim:
 *   - Active highlight when `activeEnvId === env.id && activeProjectId === project.id`.
 *   - Live spinner + "deploying" label when this card is currently deploying
 *     OR planning (matches the project-tree logic that fires while the deploy
 *     panel is open OR closed — `deployingCardId` is global slice state).
 *   - Red ring + "Last deploy failed" tooltip on error.
 *   - depth-driven left padding (`TREE_INDENT_PX * depth + TREE_INDENT_BASE`).
 */

import { Loader2 } from 'lucide-react';
import React from 'react';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { ENV_DOT_COLORS } from '../../../config/color-palette';
import { cn } from '../../../shared/utils/cn';
import type { Environment, Project } from '../../../store/slices/projects-slice';

export interface EnvironmentRowProps {
  env: Environment;
  project: Project;
  depth: number;
  activeEnvId: string | null;
  activeProjectId: string | null;
  deployingCardId: string | null | undefined;
  deployStatus: string;
  onClick: (e: React.MouseEvent, project: Project, env: Environment) => void;
}

export const EnvironmentRow: React.FC<EnvironmentRowProps> = ({
  env,
  project,
  depth,
  activeEnvId,
  activeProjectId,
  deployingCardId,
  deployStatus,
  onClick,
}) => {
  const isActiveEnv = activeEnvId === env.id && activeProjectId === project.id;
  const dotColor = ENV_DOT_COLORS[env.type] || 'bg-gray-500';
  const isDeploying =
    deployingCardId === env.cardId && (deployStatus === 'deploying' || deployStatus === 'planning');
  const isDeployFailed = deployingCardId === env.cardId && deployStatus === 'error';

  return (
    <div
      onClick={(e) => onClick(e, project, env)}
      className={cn(
        'flex items-center gap-2 px-2 py-1 cursor-pointer rounded-md mx-1 transition-colors',
        isActiveEnv
          ? 'bg-blue-500/10 text-ice-text-1'
          : 'text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-2',
        isDeploying && 'bg-blue-500/20 ring-1 ring-blue-500/40 animate-pulse',
        isDeployFailed && 'bg-red-500/10 ring-1 ring-red-500/40',
      )}
      style={{ paddingLeft: `calc(${depth * TREE_INDENT_PX + TREE_INDENT_BASE}px * var(--ice-space-scale, 1))` }}
      title={isDeploying ? 'Deploying…' : isDeployFailed ? 'Last deploy failed' : undefined}
    >
      {isDeploying ? (
        <Loader2 className="w-3 h-3 shrink-0 text-blue-400 animate-spin" />
      ) : (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
      )}
      <span className="text-ice-sm truncate">{env.name}</span>
      <span className="text-ice-2xs text-ice-text-3 ml-auto shrink-0">
        {isDeploying ? 'deploying' : env.region}
      </span>
    </div>
  );
};
