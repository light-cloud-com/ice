/**
 * Project Tree — Project row.
 *
 * Extracted verbatim from `./project-tree.tsx` (rf-ptree-6). Renders one
 * project: an expandable header (chevron + Layers icon + name + env count
 * badge + context-menu trigger) followed by its environments when expanded.
 *
 * The orchestrator's inline `renderProject` helper closed over local state
 * (editingId, editingName), event handlers (handleDragStart,
 * handleProjectClick, handleContextMenu, handleFinishRename), state setters
 * (setEditingId, setEditingName), and a ref (editInputRef). Now an FC with
 * explicit props — the orchestrator threads each through. The chevron's
 * dispatch-toggleProjectExpanded becomes an `onToggleExpanded(projectId)`
 * callback so the row stays decoupled from Redux.
 *
 * Behavior preserved verbatim:
 *   - Active highlight (`bg-blue-500/15 text-white`) when this project is
 *     the active one.
 *   - `draggable={!isEditing}` so the user can't accidentally drag the row
 *     while typing into the inline rename input.
 *   - Edit input gets `editInputRef` for focus management; Enter commits,
 *     Escape resets editingId+editingName.
 *   - Env count badge shows when not editing AND envCount > 0.
 *   - The chevron button only renders when envCount > 0 (otherwise a
 *     spacer div fills the same width).
 *   - Children render via the EnvironmentRow component, threaded through.
 */

import { ChevronDown, ChevronRight, Layers, MoreHorizontal } from 'lucide-react';
import React from 'react';
import { EnvironmentRow } from './environment-row';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { cn } from '../../../shared/utils/cn';
import type { Environment, Project } from '../../../store/slices/projects-slice';

export interface ProjectRowProps {
  project: Project;
  depth: number;
  activeProjectId: string | null;
  activeEnvId: string | null;
  deployingCardId: string | null | undefined;
  deployStatus: string;
  editingId: string | null;
  editingName: string;
  editInputRef: React.RefObject<HTMLInputElement>;
  onDragStart: (e: React.DragEvent, type: 'project' | 'folder', id: string) => void;
  onProjectClick: (project: Project) => void;
  onEnvClick: (e: React.MouseEvent, project: Project, env: Environment) => void;
  onContextMenu: (e: React.MouseEvent, type: 'project' | 'folder', id: string) => void;
  onFinishRename: () => void;
  onToggleExpanded: (projectId: string) => void;
  setEditingId: (next: string | null) => void;
  setEditingName: (next: string) => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  depth,
  activeProjectId,
  activeEnvId,
  deployingCardId,
  deployStatus,
  editingId,
  editingName,
  editInputRef,
  onDragStart,
  onProjectClick,
  onEnvClick,
  onContextMenu,
  onFinishRename,
  onToggleExpanded,
  setEditingId,
  setEditingName,
}) => {
  const isActive = project.id === activeProjectId;
  const isEditing = editingId === project.id;
  const envCount = project.environments.length;
  const isExpanded = project.expanded;
  const hasEnvs = envCount > 0;

  return (
    <div>
      {/* Project row */}
      <div
        draggable={!isEditing}
        onDragStart={(e) => onDragStart(e, 'project', project.id)}
        onClick={() => !isEditing && onProjectClick(project)}
        onContextMenu={(e) => onContextMenu(e, 'project', project.id)}
        className={cn(
          'group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md mx-1 transition-colors',
          isActive ? 'bg-blue-500/15 text-white' : 'text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1',
        )}
        style={{ paddingLeft: `calc(${depth * TREE_INDENT_PX + TREE_INDENT_BASE}px * var(--ice-space-scale, 1))` }}
      >
        {/* Expand chevron (only if has envs) */}
        {hasEnvs ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(project.id);
            }}
            className="shrink-0 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 opacity-50" />
            ) : (
              <ChevronRight className="w-3 h-3 opacity-50" />
            )}
          </button>
        ) : (
          <div className="w-3 shrink-0" />
        )}

        {/* Project icon */}
        <Layers className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-blue-400' : 'text-ice-text-3')} />

        {/* Name or edit input */}
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={onFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename();
              if (e.key === 'Escape') {
                setEditingId(null);
                setEditingName('');
              }
            }}
            className="flex-1 bg-ice-active text-white text-ice-base px-1.5 py-0.5 rounded border border-blue-500/50 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-ice-base font-medium truncate">{project.name}</span>
        )}

        {/* Env count badge */}
        {!isEditing && envCount > 0 && (
          <span className="text-ice-xs text-ice-text-3 tabular-nums shrink-0">{envCount}</span>
        )}

        {/* More button */}
        {!isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, 'project', project.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-ice-active transition-opacity shrink-0"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Environment children */}
      {isExpanded && hasEnvs && (
        <div>
          {project.environments.map((env) => (
            <EnvironmentRow
              key={env.id}
              env={env}
              project={project}
              depth={depth + 1}
              activeEnvId={activeEnvId}
              activeProjectId={activeProjectId}
              deployingCardId={deployingCardId}
              deployStatus={deployStatus}
              onClick={onEnvClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
