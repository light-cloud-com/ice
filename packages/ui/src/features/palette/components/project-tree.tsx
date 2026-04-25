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
  Layers,
  Loader2,
} from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { ENV_DOT_COLORS } from '../../../config/color-palette';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import { setActiveCard, deleteCard } from '../../../store/slices/cards-slice';
import {
  selectProjectsByOrg,
  selectFoldersByOrg,
  selectActiveProjectId,
  selectActiveEnvironmentId,
  selectLoadedOrgId,
  fetchProjectTree,
  setActiveProject,
  setActiveEnvironment,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFolderExpanded,
  toggleProjectExpanded,
  moveProjectToFolder,
  moveFolder,
  deleteProject,
  renameProject,
  type Project,
  type ProjectFolder,
  type Environment,
} from '../../../store/slices/projects-slice';
import {
  openDialog,
  openTabInPane,
  setPaneCard,
  setActivePane,
  closeTabsByCardIds,
} from '../../../store/slices/ui-slice';
import type { AppDispatch, RootState } from '../../../store';

// Drag data is encoded as "type:id"
type DragItemType = 'project' | 'folder';

function encodeDrag(type: DragItemType, id: string) {
  return `${type}:${id}`;
}

function decodeDrag(data: string): { type: DragItemType; id: string } | null {
  const sep = data.indexOf(':');
  if (sep === -1) return null;
  const type = data.slice(0, sep) as DragItemType;
  const id = data.slice(sep + 1);
  if (type !== 'project' && type !== 'folder') return null;
  return { type, id };
}

// Environment type → dot color
const ENV_DOT_COLOR = ENV_DOT_COLORS;

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

  // Fetch project tree from backend when org changes
  useEffect(() => {
    if (orgId && orgId !== loadedOrgId) {
      dispatch(fetchProjectTree(orgId));
    }
  }, [orgId, loadedOrgId, dispatch]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Focus inputs
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (creatingFolder !== null && newFolderRef.current) {
      newFolderRef.current.focus();
    }
  }, [creatingFolder]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleProjectClick = useCallback(
    (project: Project) => {
      // setActiveProject also expands the project tree node
      dispatch(setActiveProject(project.id));
      // Open first env card in the active pane
      if (project.environments.length > 0 && panes.length > 0) {
        const firstEnv = project.environments[0];
        const activePaneId = panes[0].id;
        dispatch(openTabInPane({ paneId: activePaneId, cardId: firstEnv.cardId }));
        dispatch(setPaneCard({ paneId: activePaneId, cardId: firstEnv.cardId }));
        dispatch(setActivePane(activePaneId));
        dispatch(setActiveCard(firstEnv.cardId));
      }
    },
    [dispatch, panes],
  );

  const handleEnvClick = useCallback(
    (e: React.MouseEvent, project: Project, env: Environment) => {
      e.stopPropagation();
      dispatch(setActiveProject(project.id));
      dispatch(setActiveEnvironment(env.id));
      if (panes.length > 0) {
        const activePaneId = panes[0].id;
        dispatch(openTabInPane({ paneId: activePaneId, cardId: env.cardId }));
        dispatch(setPaneCard({ paneId: activePaneId, cardId: env.cardId }));
        dispatch(setActivePane(activePaneId));
        dispatch(setActiveCard(env.cardId));
      }
    },
    [dispatch, panes],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, type: 'project' | 'folder', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, id });
  }, []);

  const handleStartRename = useCallback(
    (type: 'project' | 'folder', id: string) => {
      setContextMenu(null);
      if (type === 'project') {
        const project = projects.find((p) => p.id === id);
        if (project) {
          setEditingId(id);
          setEditingName(project.name);
        }
      } else {
        const folder = folders.find((f) => f.id === id);
        if (folder) {
          setEditingId(id);
          setEditingName(folder.name);
        }
      }
    },
    [projects, folders],
  );

  const handleFinishRename = useCallback(async () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null);
      return;
    }
    const name = editingName.trim();
    const isProject = projects.some((p) => p.id === editingId);
    // Update locally immediately
    if (isProject) {
      dispatch(renameProject({ projectId: editingId, name }));
    } else {
      dispatch(renameFolder({ folderId: editingId, name }));
    }
    // Sync to backend
    try {
      const { default: axiosInstance } = await import('../../../shared/api/axios-instance');
      await axiosInstance.post('/canvas/projects/update', { projectId: editingId, name });
    } catch {
      // Backend sync failed — local update still stands
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, dispatch, projects]);

  const handleDelete = useCallback(
    async (type: 'project' | 'folder', id: string) => {
      setContextMenu(null);
      try {
        const { default: axiosInstance } = await import('../../../shared/api/axios-instance');
        if (type === 'project') {
          const project = projects.find((p) => p.id === id);
          if (project) {
            const cardIds = project.environments.map((e) => e.cardId);
            if (cardIds.length > 0) {
              dispatch(closeTabsByCardIds(cardIds));
              for (const cid of cardIds) {
                dispatch(deleteCard(cid));
              }
            }
          }
          await axiosInstance.post('/canvas/projects/delete', { projectId: id });
          dispatch(deleteProject(id));
        } else {
          await axiosInstance.post('/canvas/projects/delete', { projectId: id });
          dispatch(deleteFolder(id));
        }
      } catch {
        // If backend fails, still remove locally
        if (type === 'project') dispatch(deleteProject(id));
        else dispatch(deleteFolder(id));
      }
    },
    [dispatch, projects],
  );

  const handleCreateFolder = useCallback(() => {
    setCreatingFolder('root');
    setNewFolderName(t('projectTree.defaultFolderName'));
  }, [t]);

  const handleFinishCreateFolder = useCallback(async () => {
    if (newFolderName.trim() && orgId) {
      const parentId = creatingFolder === 'root' ? null : creatingFolder;
      try {
        const { default: axiosInstance } = await import('../../../shared/api/axios-instance');
        await axiosInstance.post('/canvas/projects/create', {
          name: newFolderName.trim(),
          type: 'folder',
          parentId: parentId || undefined,
        });
        // Refresh tree from backend
        dispatch(fetchProjectTree(orgId));
      } catch {
        // Fallback: create locally
        dispatch(createFolder({ name: newFolderName.trim(), organisationId: orgId, parentFolderId: parentId }));
      }
    }
    setCreatingFolder(null);
    setNewFolderName('');
  }, [creatingFolder, newFolderName, orgId, dispatch]);

  // ── Drag & Drop (unified for projects + folders) ─────────────────────────

  const handleDragStart = useCallback((e: React.DragEvent, type: DragItemType, id: string) => {
    e.dataTransfer.setData('text/plain', encodeDrag(type, id));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(targetFolderId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverId(null);
      const raw = e.dataTransfer.getData('text/plain');
      const item = decodeDrag(raw);
      if (!item) return;

      if (item.type === 'project') {
        dispatch(moveProjectToFolder({ projectId: item.id, folderId: targetFolderId }));
      } else if (item.type === 'folder') {
        // Don't drop a folder into itself
        if (item.id === targetFolderId) return;
        dispatch(moveFolder({ folderId: item.id, parentFolderId: targetFolderId }));
      }
    },
    [dispatch],
  );

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderEnvironment = (env: Environment, project: Project, depth: number) => {
    const isActiveEnv = activeEnvId === env.id && activeProjectId === project.id;
    const dotColor = ENV_DOT_COLOR[env.type] || 'bg-gray-500';
    const isDeploying = deployingCardId === env.cardId && (deployStatus === 'deploying' || deployStatus === 'planning');
    const isDeployFailed = deployingCardId === env.cardId && deployStatus === 'error';

    return (
      <div
        key={env.id}
        onClick={(e) => handleEnvClick(e, project, env)}
        className={cn(
          'flex items-center gap-2 px-2 py-1 cursor-pointer rounded-md mx-1 transition-colors',
          isActiveEnv ? 'bg-blue-500/10 text-ice-text-1' : 'text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-2',
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
        <span className="text-ice-2xs text-ice-text-3 ml-auto shrink-0">{isDeploying ? 'deploying' : env.region}</span>
      </div>
    );
  };

  const renderProject = (project: Project, depth: number) => {
    const isActive = project.id === activeProjectId;
    const isEditing = editingId === project.id;
    const envCount = project.environments.length;
    const isExpanded = project.expanded;
    const hasEnvs = envCount > 0;

    return (
      <div key={project.id}>
        {/* Project row */}
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, 'project', project.id)}
          onClick={() => !isEditing && handleProjectClick(project)}
          onContextMenu={(e) => handleContextMenu(e, 'project', project.id)}
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
                dispatch(toggleProjectExpanded(project.id));
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
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename();
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
                handleContextMenu(e, 'project', project.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-ice-active transition-opacity shrink-0"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Environment children */}
        {isExpanded && hasEnvs && (
          <div>{project.environments.map((env) => renderEnvironment(env, project, depth + 1))}</div>
        )}
      </div>
    );
  };

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
