/**
 * Project Tree Component
 *
 * Full nestable tree: Folders → Projects → Environments
 * - Drag & drop folders and projects into other folders
 * - Projects expand to show environment children
 * - Click environment → activate it and open its card
 */

import { FolderPlus, Plus, FolderOpen, Check, X } from 'lucide-react';
import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
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
  type Project,
  type ProjectFolder,
} from '../../../store/slices/projects-slice';
import { openDialog } from '../../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../../store';
import { useTreeDrag } from '../hooks/use-tree-drag';
import { useTreeEffects } from '../hooks/use-tree-effects';
import { useTreeHandlers } from '../hooks/use-tree-handlers';
import { FolderRow } from './folder-row';
import { ProjectRow } from './project-row';
import { TreeContextMenu } from './tree-context-menu';

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

  const renderFolder = (folder: ProjectFolder, depth: number) => (
    <FolderRow
      key={folder.id}
      folder={folder}
      depth={depth}
      folders={folders}
      projects={projects}
      editingId={editingId}
      editingName={editingName}
      dragOverId={dragOverId}
      editInputRef={editInputRef}
      renderProject={renderProject}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onFinishRename={handleFinishRename}
      onToggleExpanded={(id) => dispatch(toggleFolderExpanded(id))}
      setEditingId={setEditingId}
      setEditingName={setEditingName}
    />
  );

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
      {contextMenu && (
        <TreeContextMenu
          contextMenu={contextMenu}
          projects={projects}
          folders={folders}
          menuRef={menuRef}
          dispatch={dispatch}
          t={t}
          onStartRename={handleStartRename}
          onDelete={handleDelete}
          setContextMenu={setContextMenu}
          setCreatingFolder={setCreatingFolder}
          setNewFolderName={setNewFolderName}
        />
      )}
    </div>
  );
};
