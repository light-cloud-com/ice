/**
 * Project Browser — Clean hierarchical folder/project tree
 *
 * Matches platform editor's sidebar style.
 * Scoped to selected organisation.
 */

import { Folder, FolderOpen, Loader2, FolderPlus, FilePlus } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { PanelHeader, PanelHeaderAction } from '../../../shared/components/ui/panel-header';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { openDialog } from '../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../store';
import type { ProjectNode } from '../types/project-node';
import { buildPath, flattenItems } from '../utils/build-path';
import { TreeItem } from './tree-item';

// ─── Main Component ─────────────────────────────────────────────────────────

export function ProjectBrowser() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);

  // Resolve which node is active from the current URL
  const resolved = useResolvePath(pathname.split('/').filter(Boolean));
  const activeNodeId = resolved.id;
  const activeSubpage = resolved.type === 'project' ? resolved.subpage || 'canvas' : null;

  const [items, setItems] = useState<ProjectNode[]>([]);
  const [flatFolders, setFlatFolders] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ice-project-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [search, setSearch] = useState('');

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem('ice-project-expanded', JSON.stringify([...expanded]));
  }, [expanded]);

  const orgId = selectedOrg?.id;

  const fetchProjects = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await axiosInstance.post('/canvas/projects', {
        organisationId: orgId,
        ...(search ? { search } : {}),
      });
      const flat: ProjectNode[] = (res.data || []).map((p: any) => ({ ...p, children: [] }));

      // Save flat folders for move menu
      setFlatFolders(flat.filter((p) => p.type === 'folder'));

      // Build tree
      const map = new Map<string, ProjectNode>();
      const roots: ProjectNode[] = [];
      for (const item of flat) map.set(item.id, item);
      for (const item of flat) {
        if (item.parent_id && map.has(item.parent_id)) {
          map.get(item.parent_id)!.children.push(item);
        } else {
          roots.push(item);
        }
      }
      setItems(roots);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
    [selectedOrg, fetchProjects, t],
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

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        icon={<FolderOpen aria-hidden="true" className="w-3.5 h-3.5" />}
        title={t('projectBrowser.title')}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t('projectBrowser.newProjectName') + '…',
        }}
        actions={
          <>
            <PanelHeaderAction
              icon={<FilePlus aria-hidden="true" className="w-3.5 h-3.5" />}
              label={t('projectBrowser.newProject')}
              onClick={() => dispatch(openDialog('projectWizard'))}
            />
            <PanelHeaderAction
              icon={<FolderPlus aria-hidden="true" className="w-3.5 h-3.5" />}
              label={t('projectBrowser.newFolderName')}
              onClick={() => handleCreate('folder')}
            />
          </>
        }
      />

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('application/ice-tree-id');
          if (draggedId) handleMove(draggedId, null);
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 animate-spin text-ice-text-3" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Folder aria-hidden="true" className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-ice-base text-ice-text-3 mb-3">{t('projectBrowser.emptyState')}</p>
            <button
              onClick={() => dispatch(openDialog('projectWizard'))}
              className="px-3 py-1 text-ice-sm font-medium rounded bg-ice-accent text-white hover:bg-ice-accent-hover transition-[background-color] focus-visible:ring-1 focus-visible:ring-blue-500 outline-none"
            >
              {t('projectBrowser.createProject')}
            </button>
          </div>
        ) : (
          items.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              level={0}
              expandedIds={expanded}
              activeNodeId={activeNodeId}
              activeSubpage={activeSubpage}
              onToggle={toggleExpand}
              onOpen={handleOpen}
              onNavigateSubpage={handleNavigateSubpage}
              onRename={handleRename}
              onDelete={handleDelete}
              onCreateIn={(parentId) => handleCreate('project', parentId)}
              onMove={handleMove}
              allFolders={flatFolders}
            />
          ))
        )}
      </div>
    </div>
  );
}
