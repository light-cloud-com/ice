/**
 * Project Tree — Folder row.
 *
 * Extracted verbatim from `./project-tree.tsx` (rf-ptree-7). Renders one
 * folder: an expandable header (chevron + folder icon + name + item-count
 * badge + context-menu trigger) followed by its child folders and projects
 * when expanded.
 *
 * The folder is recursive — child folders render via direct self-reference
 * `<FolderRow ...>`, and child projects render via a `renderProject`
 * callback prop the orchestrator threads in (it already has a `renderProject`
 * helper that wraps `<ProjectRow ...>`). This keeps FolderRow ignorant of
 * how the orchestrator chooses to construct ProjectRow instances — whether
 * that's a thin wrapper, a memoized cache, or some future variant.
 *
 * Behavior preserved verbatim:
 *   - drop-target highlight: green tint + green text when `dragOverId === folder.id`.
 *   - draggable={!isEditing}, onDrop = drop-onto-this-folder.
 *   - onClick = toggleFolderExpanded (callback prop) when not editing.
 *   - amber border on the rename input (matches the source's amber-themed
 *     folder palette; project-row uses blue).
 *   - item count = childFolders.length + childProjects.length.
 *   - children render in declaration order: subfolders first, then child
 *     projects.
 */

import { ChevronDown, ChevronRight, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import React from 'react';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { cn } from '../../../shared/utils/cn';
import type { Project, ProjectFolder } from '../../../store/slices/projects-slice';

export interface FolderRowProps {
  folder: ProjectFolder;
  depth: number;
  folders: ProjectFolder[];
  projects: Project[];
  editingId: string | null;
  editingName: string;
  dragOverId: string | null;
  editInputRef: React.RefObject<HTMLInputElement>;
  renderProject: (project: Project, depth: number) => React.ReactElement;
  onDragStart: (e: React.DragEvent, type: 'project' | 'folder', id: string) => void;
  onDragOver: (e: React.DragEvent, targetFolderId: string | null) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetFolderId: string | null) => void;
  onContextMenu: (e: React.MouseEvent, type: 'project' | 'folder', id: string) => void;
  onFinishRename: () => void;
  onToggleExpanded: (folderId: string) => void;
  setEditingId: (next: string | null) => void;
  setEditingName: (next: string) => void;
}

export const FolderRow: React.FC<FolderRowProps> = (props) => {
  const {
    folder,
    depth,
    folders,
    projects,
    editingId,
    editingName,
    dragOverId,
    editInputRef,
    renderProject,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onContextMenu,
    onFinishRename,
    onToggleExpanded,
    setEditingId,
    setEditingName,
  } = props;

  const isEditing = editingId === folder.id;
  const isDragTarget = dragOverId === folder.id;
  const childFolders = folders.filter((f) => f.parentFolderId === folder.id).sort((a, b) => a.order - b.order);
  const childProjects = projects.filter((p) => p.folderId === folder.id).sort((a, b) => a.order - b.order);
  const FolderIcon = folder.expanded ? FolderOpen : Folder;
  const ChevronIcon = folder.expanded ? ChevronDown : ChevronRight;

  return (
    <div>
      {/* Folder row */}
      <div
        draggable={!isEditing}
        onDragStart={(e) => onDragStart(e, 'folder', folder.id)}
        onDragOver={(e) => onDragOver(e, folder.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, folder.id)}
        onClick={() => !isEditing && onToggleExpanded(folder.id)}
        onContextMenu={(e) => onContextMenu(e, 'folder', folder.id)}
        className={cn(
          'group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer rounded-md mx-1 transition-colors',
          isDragTarget
            ? 'bg-green-500/15 text-green-400'
            : 'text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1',
        )}
        style={{ paddingLeft: `calc(${depth * TREE_INDENT_PX + TREE_INDENT_BASE}px * var(--ice-space-scale, 1))` }}
      >
        <ChevronIcon className="w-3 h-3 shrink-0 opacity-50" />
        <FolderIcon className="w-3.5 h-3.5 shrink-0 text-amber-400/70" />

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
            className="flex-1 bg-ice-active text-white text-ice-base px-1.5 py-0.5 rounded border border-amber-500/50 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-ice-base font-medium truncate">{folder.name}</span>
        )}

        {/* Item count */}
        {!isEditing && childFolders.length + childProjects.length > 0 && (
          <span className="text-ice-xs text-ice-text-3 tabular-nums shrink-0">
            {childFolders.length + childProjects.length}
          </span>
        )}

        {/* More button */}
        {!isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, 'folder', folder.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-ice-active transition-opacity shrink-0"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Children */}
      {folder.expanded && (
        <>
          {childFolders.map((f) => (
            <FolderRow key={f.id} {...props} folder={f} depth={depth + 1} />
          ))}
          {childProjects.map((p) => (
            <React.Fragment key={p.id}>{renderProject(p, depth + 1)}</React.Fragment>
          ))}
        </>
      )}
    </div>
  );
};
