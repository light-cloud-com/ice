/**
 * Project Tree Component
 *
 * Full nestable tree: Folders → Projects → Environments
 * - Drag & drop folders and projects into other folders
 * - Projects expand to show environment children
 * - Click environment → activate it and open its card
 */

import {
  FolderPlus,
  Plus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderInput,
  Check,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import {
  selectProjectsByOrg,
  selectFoldersByOrg,
  selectActiveProjectId,
  selectActiveEnvironmentId,
  selectLoadedOrgId,
  toggleFolderExpanded,
  toggleProjectExpanded,
  moveProjectToFolder,
  moveFolder,
  type Project,
  type ProjectFolder,
} from '../../../store/slices/projects-slice';
import { openDialog } from '../../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../../store';
import { useTreeDrag } from '../hooks/use-tree-drag';
import { useTreeEffects } from '../hooks/use-tree-effects';
import { useTreeHandlers } from '../hooks/use-tree-handlers';
import { ProjectRow } from './project-row';

// =============================================================================
// Context Menu
// =============================================================================

interface ContextMenuState {
  x: number;
  y: number;
  type: 'project' | 'folder';
  id: string;
}

// =============================================================================
// Main Component
// =============================================================================

export const ProjectTree: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const selectedOrg = useSelector((state: RootState) => state.account?.selectedOrg);
  const orgId = selectedOrg?.id || '';
  const loadedOrgId = useSelector(selectLoadedOrgId);
  const projects = useSelector(selectProjectsByOrg(orgId));
  const folders = useSelector(selectFoldersByOrg(orgId));
  const activeProjectId = useSelector(selectActiveProjectId);
  const activeEnvId = useSelector(selectActiveEnvironmentId);
  // Phase 5 — show a live spinner on the env whose card is currently
  // deploying, even if the user navigates away from the deploy panel.
  const deployingCardId = useSelector((state: RootState) => state.deploy.currentDeployCardId);
  const deployStatus = useSelector((state: RootState) => state.deploy.status);
  const panes = useSelector((state: RootState) => state.ui.splitView.panes);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  // ── Effects + refs ──────────────────────────────────────────────────────

  const { menuRef, editInputRef, newFolderRef } = useTreeEffects({
    orgId,
    loadedOrgId,
    editingId,
    creatingFolder,
    contextMenu,
    setContextMenu,
  });

  // ── Handlers ────────────────────────────────────────────────────────────

  const {
    handleProjectClick,
    handleEnvClick,
    handleContextMenu,
    handleStartRename,
    handleFinishRename,
    handleDelete,
    handleCreateFolder,
    handleFinishCreateFolder,
  } = useTreeHandlers({
    t,
    orgId,
    projects,
    folders,
    panes,
    editingId,
    editingName,
    creatingFolder,
    newFolderName,
    setContextMenu,
    setEditingId,
    setEditingName,
    setCreatingFolder,
    setNewFolderName,
  });

  // ── Drag & Drop (unified for projects + folders) ─────────────────────────

  const { dragOverId, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useTreeDrag();

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderProject = (project: Project, depth: number) => (
    <ProjectRow
      key={project.id}
      project={project}
      depth={depth}
      activeProjectId={activeProjectId}
      activeEnvId={activeEnvId}
      deployingCardId={deployingCardId}
      deployStatus={deployStatus}
      editingId={editingId}
      editingName={editingName}
      editInputRef={editInputRef}
      onDragStart={handleDragStart}
      onProjectClick={handleProjectClick}
      onEnvClick={handleEnvClick}
      onContextMenu={handleContextMenu}
      onFinishRename={handleFinishRename}
      onToggleExpanded={(id) => dispatch(toggleProjectExpanded(id))}
      setEditingId={setEditingId}
      setEditingName={setEditingName}
    />
  );

  const renderFolder = (folder: ProjectFolder, depth: number) => {
    const isEditing = editingId === folder.id;
    const isDragTarget = dragOverId === folder.id;
    const childFolders = folders.filter((f) => f.parentFolderId === folder.id).sort((a, b) => a.order - b.order);
    const childProjects = projects.filter((p) => p.folderId === folder.id).sort((a, b) => a.order - b.order);
    const FolderIcon = folder.expanded ? FolderOpen : Folder;
    const ChevronIcon = folder.expanded ? ChevronDown : ChevronRight;

    return (
      <div key={folder.id}>
        {/* Folder row */}
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, folder.id)}
          onClick={() => !isEditing && dispatch(toggleFolderExpanded(folder.id))}
          onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
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
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
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
                handleContextMenu(e, 'folder', folder.id);
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
            {childFolders.map((f) => renderFolder(f, depth + 1))}
            {childProjects.map((p) => renderProject(p, depth + 1))}
          </>
        )}
      </div>
    );
  };

  // Top-level items
  const topFolders = folders.filter((f) => f.parentFolderId === null).sort((a, b) => a.order - b.order);
  const topProjects = projects.filter((p) => p.folderId === null).sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          onClick={() => dispatch(openDialog('projectWizard'))}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-ice-sm font-medium rounded-md',
            'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors',
          )}
        >
          <Plus className="w-3 h-3" />
          {t('projectTree.newProject')}
        </button>
        <button
          onClick={handleCreateFolder}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-ice-sm font-medium rounded-md',
            'bg-ice-hover text-ice-text-2 hover:bg-ice-active hover:text-ice-text-2 transition-colors',
          )}
        >
          <FolderPlus className="w-3 h-3" />
          {t('projectTree.newFolder')}
        </button>
      </div>
      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mx-3" />
      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-2"
        onDragOver={(e) => handleDragOver(e, null)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
      >
        {/* New folder inline input */}
        {creatingFolder !== null && (
          <div className="flex items-center gap-1.5 pl-2 pr-2 py-1.5 mx-1">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
            <input
              ref={newFolderRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onBlur={handleFinishCreateFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishCreateFolder();
                if (e.key === 'Escape') {
                  setCreatingFolder(null);
                  setNewFolderName('');
                }
              }}
              className="flex-1 bg-ice-active text-white text-ice-base px-1.5 py-0.5 rounded border border-amber-500/50 outline-none"
            />
            <button
              onClick={handleFinishCreateFolder}
              className="p-0.5 rounded hover:bg-green-500/20 text-green-400 transition-colors"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setCreatingFolder(null);
                setNewFolderName('');
              }}
              className="p-0.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Render tree */}
        {topFolders.map((f) => renderFolder(f, 0))}
        {topProjects.map((p) => renderProject(p, 0))}

        {/* Empty state */}
        {topFolders.length === 0 && topProjects.length === 0 && creatingFolder === null && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <FolderOpen className="w-8 h-8 text-ice-text-3 mb-3" />
            <p className="text-ice-base text-ice-text-3 mb-1">{t('projectTree.emptyNoProjects')}</p>
            <p className="text-ice-sm text-ice-text-3">{t('projectTree.emptyHint')}</p>
          </div>
        )}
      </div>
      {/* Context Menu */}
      {contextMenu &&
        (() => {
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
                onClick={() => handleStartRename(contextMenu.type, contextMenu.id)}
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
                onClick={() => handleDelete(contextMenu.type, contextMenu.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-ice-base text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {t('projectTree.contextDelete')}
              </button>
            </div>
          );
        })()}
    </div>
  );
};
