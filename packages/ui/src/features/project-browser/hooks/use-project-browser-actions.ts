/**
 * useProjectBrowserActions — CRUD + navigation handlers for the Project
 * Browser tree.
 *
 * Extracted from `components/project-browser.tsx` during rf-pbrws-3. Owns
 * the `handleCreate` / `handleRename` / `handleDelete` / `handleMove`
 * callbacks (each posting to the canvas projects API and re-fetching), plus
 * the navigation helpers `handleOpen` / `handleNavigateSubpage` that
 * compute paths via `buildPath` + `flattenItems`.
 *
 * The hook takes data state as args (items, flatFolders), the auto-expand
 * setter from `useProjectBrowserData`, the active org, and the bound
 * `fetchProjects` callback.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { buildPath, flattenItems } from '../utils/build-path';
import type { ProjectNode } from '../types/project-node';

export interface UseProjectBrowserActionsArgs {
  items: ProjectNode[];
  flatFolders: ProjectNode[];
  fetchProjects: () => Promise<void>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedOrg: { id: string; name: string } | null | undefined;
}

export interface UseProjectBrowserActionsResult {
  handleCreate: (type: 'folder' | 'project', parentId?: string) => Promise<void>;
  handleRename: (id: string, name: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleMove: (id: string, parentId: string | null) => Promise<void>;
  handleNavigateSubpage: (node: ProjectNode, subpage: string) => void;
  handleOpen: (node: ProjectNode) => void;
}

export function useProjectBrowserActions({
  items,
  flatFolders,
  fetchProjects,
  setExpanded,
  selectedOrg,
}: UseProjectBrowserActionsArgs): UseProjectBrowserActionsResult {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleCreate = useCallback(
    async (type: 'folder' | 'project', parentId?: string) => {
      if (!selectedOrg) return;
      await axiosInstance.post('/canvas/projects/create', {
        name: type === 'folder' ? t('projectBrowser.newFolderName') : t('projectBrowser.newProjectName'),
        type,
        parentId: parentId || null,
        organisationId: selectedOrg.id,
      });
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      fetchProjects();
    },
    [selectedOrg, fetchProjects, setExpanded, t],
  );

  const handleRename = useCallback(
    async (id: string, name: string) => {
      await axiosInstance.post('/canvas/projects/update', { projectId: id, name });
      fetchProjects();
    },
    [fetchProjects],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(t('projectBrowser.deleteConfirm'))) return;
      await axiosInstance.post('/canvas/projects/delete', { projectId: id, organisationId: selectedOrg?.id });
      fetchProjects();
    },
    [selectedOrg, fetchProjects, t],
  );

  const handleMove = useCallback(
    async (id: string, parentId: string | null) => {
      await axiosInstance.post('/canvas/projects/move', { projectId: id, parentId });
      fetchProjects();
    },
    [fetchProjects],
  );

  const handleNavigateSubpage = useCallback(
    (node: ProjectNode, subpage: string) => {
      const allFlat = flattenItems(items, flatFolders);
      const path = buildPath(node, allFlat, selectedOrg?.name);
      // Canvas is the default view — no suffix needed
      navigate(subpage === 'canvas' ? path : `${path}/${subpage}`);
    },
    [flatFolders, items, navigate, selectedOrg],
  );

  const handleOpen = useCallback(
    (node: ProjectNode) => {
      // Build the URL path and navigate
      const path = buildPath(node, flattenItems(items, flatFolders), selectedOrg?.name);
      navigate(path);
    },
    [flatFolders, items, navigate, selectedOrg],
  );

  return {
    handleCreate,
    handleRename,
    handleDelete,
    handleMove,
    handleNavigateSubpage,
    handleOpen,
  };
}
