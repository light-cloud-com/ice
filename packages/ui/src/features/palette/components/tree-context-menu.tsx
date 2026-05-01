/**
 * Project Tree — Context Menu.
 *
 * Extracted verbatim from `./project-tree.tsx` (rf-ptree-8). Renders the
 * floating context menu (Rename / Move to Top Level / New Subfolder /
 * Delete) when the user right-clicks a project or folder row in the tree.
 *
 * The menu's existence-gate (`if (contextMenu) ...`) lives in the
 * orchestrator: this FC always renders its body, and the orchestrator
 * passes a non-null `contextMenu` prop. The orchestrator-side `useEffect`
 * (`useTreeEffects` effect 4) closes the menu on outside clicks; the
 * menuRef is threaded through so that effect's `contains(e.target)` check
 * can identify "click was inside the menu."
 *
 * Behavior preserved verbatim:
 *   - Always shows: Rename + Delete.
 *   - Conditional: "Move to Top Level" only when the item is currently
 *     nested (project.folderId != null OR folder.parentFolderId != null).
 *   - Conditional: "New Subfolder" only when the item is a folder.
 *   - Position: fixed, z-50, x/y from contextMenu.
 *   - Closes the menu (setContextMenu(null)) inside the Move-to-Top-Level
 *     and New-Subfolder buttons before dispatching the next action.
 */

import { Pencil, Trash2, FolderInput, FolderPlus } from 'lucide-react';
import React from 'react';
import {
  moveProjectToFolder,
  moveFolder,
  type Project,
  type ProjectFolder,
} from '../../../store/slices/projects-slice';
import type { AppDispatch } from '../../../store';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'project' | 'folder';
  id: string;
}

export type TranslatorFn = (key: string, vars?: Record<string, string | number>) => string;

export interface TreeContextMenuProps {
  contextMenu: ContextMenuState;
  projects: Project[];
  folders: ProjectFolder[];
  menuRef: React.RefObject<HTMLDivElement>;
  dispatch: AppDispatch;
  t: TranslatorFn;
  onStartRename: (type: 'project' | 'folder', id: string) => void;
  onDelete: (type: 'project' | 'folder', id: string) => void;
  setContextMenu: (next: ContextMenuState | null) => void;
  setCreatingFolder: (next: string | null) => void;
  setNewFolderName: (next: string) => void;
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  contextMenu,
  projects,
  folders,
  menuRef,
  dispatch,
  t,
  onStartRename,
  onDelete,
  setContextMenu,
  setCreatingFolder,
  setNewFolderName,
}) => {
  const isProject = contextMenu.type === 'project';
  const isFolder = contextMenu.type === 'folder';
  // Only show "Move to Top Level" if item is nested
  const isNested = isProject
    ? projects.find((p) => p.id === contextMenu.id)?.folderId != null
    : folders.find((f) => f.id === contextMenu.id)?.parentFolderId != null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 rounded-md border border-ice-border bg-ice-surface shadow-xl py-1"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        onClick={() => onStartRename(contextMenu.type, contextMenu.id)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-ice-text-1 hover:bg-ice-active transition-colors"
      >
        <Pencil className="w-3 h-3" />
        {t('projectTree.contextRename')}
      </button>
      {isNested && isProject && (
        <button
          onClick={() => {
            setContextMenu(null);
            dispatch(moveProjectToFolder({ projectId: contextMenu.id, folderId: null }));
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-ice-text-1 hover:bg-ice-active transition-colors"
        >
          <FolderInput className="w-3 h-3" />
          {t('projectTree.contextMoveToTopLevel')}
        </button>
      )}
      {isNested && isFolder && (
        <button
          onClick={() => {
            setContextMenu(null);
            dispatch(moveFolder({ folderId: contextMenu.id, parentFolderId: null }));
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-ice-text-1 hover:bg-ice-active transition-colors"
        >
          <FolderInput className="w-3 h-3" />
          {t('projectTree.contextMoveToTopLevel')}
        </button>
      )}
      {isFolder && (
        <button
          onClick={() => {
            setContextMenu(null);
            setCreatingFolder(contextMenu.id);
            setNewFolderName(t('projectTree.defaultFolderName'));
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-ice-text-1 hover:bg-ice-active transition-colors"
        >
          <FolderPlus className="w-3 h-3" />
          {t('projectTree.contextNewSubfolder')}
        </button>
      )}
      <div className="h-px bg-ice-border my-1" />
      <button
        onClick={() => onDelete(contextMenu.type, contextMenu.id)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
        {t('projectTree.contextDelete')}
      </button>
    </div>
  );
};
