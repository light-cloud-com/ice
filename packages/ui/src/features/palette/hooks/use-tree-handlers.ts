/**
 * Project Tree — non-drag handler bundle.
 *
 * Extracted from `../components/project-tree.tsx` (rf-ptree-2). Bundles the
 * eight non-drag `useCallback` handlers — project click, env click, context
 * menu, start/finish rename, delete, start/finish create-folder — into a
 * custom hook so the orchestrator stays focused on layout.
 *
 * The hook does NOT own the local state. The orchestrator still calls
 * `useState` for `contextMenu`, `editingId`, `editingName`, `creatingFolder`,
 * `newFolderName`, and the orchestrator passes the values + setters in.
 * Mirrors the rf-pset-4 / rf-pdpl-21 hook-bundle pattern: state lives in the
 * orchestrator, handlers live in the hook.
 *
 * Behavior preserved verbatim — every dispatch ordering, every dynamic
 * `import('../../../shared/api/axios-instance')` for backend sync, every
 * silent `try/catch` fallback. The dynamic-axios import is load-bearing in
 * the original (it kept axios out of the initial palette chunk); the hook
 * keeps the same dynamic import shape.
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { setActiveCard, deleteCard } from '../../../store/slices/cards-slice';
import {
  setActiveProject,
  setActiveEnvironment,
  createFolder,
  renameFolder,
  deleteFolder,
  fetchProjectTree,
  deleteProject,
  renameProject,
  type Project,
  type ProjectFolder,
  type Environment,
} from '../../../store/slices/projects-slice';
import {
  openTabInPane,
  setPaneCard,
  setActivePane,
  closeTabsByCardIds,
} from '../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../store';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'project' | 'folder';
  id: string;
}

export interface PaneSnapshot {
  id: string;
}

/** Translator shim covering the i18n surface this hook uses.
 *  Mirrors `useTranslation().t` from `'../../../i18n'`. */
export type TranslatorFn = (key: string, vars?: Record<string, string | number>) => string;

export interface UseTreeHandlersInput {
  t: TranslatorFn;
  orgId: string;
  projects: Project[];
  folders: ProjectFolder[];
  panes: PaneSnapshot[];
  editingId: string | null;
  editingName: string;
  creatingFolder: string | null;
  newFolderName: string;
  setContextMenu: (next: ContextMenuState | null) => void;
  setEditingId: (next: string | null) => void;
  setEditingName: (next: string) => void;
  setCreatingFolder: (next: string | null) => void;
  setNewFolderName: (next: string) => void;
}

export interface UseTreeHandlersOutput {
  handleProjectClick: (project: Project) => void;
  handleEnvClick: (e: React.MouseEvent, project: Project, env: Environment) => void;
  handleContextMenu: (e: React.MouseEvent, type: 'project' | 'folder', id: string) => void;
  handleStartRename: (type: 'project' | 'folder', id: string) => void;
  handleFinishRename: () => Promise<void>;
  handleDelete: (type: 'project' | 'folder', id: string) => Promise<void>;
  handleCreateFolder: () => void;
  handleFinishCreateFolder: () => Promise<void>;
}

export function useTreeHandlers(input: UseTreeHandlersInput): UseTreeHandlersOutput {
  const {
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
  } = input;
  const dispatch = useDispatch<AppDispatch>();

  // ─── Project / Env click ────────────────────────────────────────────

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

  // ─── Context menu open ──────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: 'project' | 'folder', id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, type, id });
    },
    [setContextMenu],
  );

  // ─── Rename ─────────────────────────────────────────────────────────

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
    [projects, folders, setContextMenu, setEditingId, setEditingName],
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
  }, [editingId, editingName, dispatch, projects, setEditingId, setEditingName]);

  // ─── Delete ─────────────────────────────────────────────────────────

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
    [dispatch, projects, setContextMenu],
  );

  // ─── Create folder ──────────────────────────────────────────────────

  const handleCreateFolder = useCallback(() => {
    setCreatingFolder('root');
    setNewFolderName(t('projectTree.defaultFolderName'));
  }, [t, setCreatingFolder, setNewFolderName]);

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
  }, [creatingFolder, newFolderName, orgId, dispatch, setCreatingFolder, setNewFolderName]);

  return {
    handleProjectClick,
    handleEnvClick,
    handleContextMenu,
    handleStartRename,
    handleFinishRename,
    handleDelete,
    handleCreateFolder,
    handleFinishCreateFolder,
  };
}
