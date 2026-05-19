/**
 * Project Browser — Clean hierarchical folder/project tree
 *
 * Matches platform editor's sidebar style.
 * Scoped to selected organisation.
 *
 * Orchestrator shell: data state and CRUD handlers are delegated to
 * `useProjectBrowserData` and `useProjectBrowserActions`. Tree rendering
 * lives in the `TreeItem` leaf component.
 */

import { Folder, FolderOpen, Loader2, FolderPlus, FilePlus } from 'lucide-react';
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { TreeItem } from './tree-item';
import { useTranslation } from '../../../i18n';
import { PanelHeader, PanelHeaderAction } from '../../../shared/components/ui/panel-header';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { openDialog } from '../../../store/slices/ui-slice';
import { useProjectBrowserActions } from '../hooks/use-project-browser-actions';
import { useProjectBrowserData } from '../hooks/use-project-browser-data';
import type { RootState, AppDispatch } from '../../../store';

export function ProjectBrowser() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { pathname } = useLocation();
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);

  // Resolve which node is active from the current URL
  const resolved = useResolvePath(pathname.split('/').filter(Boolean));
  const activeNodeId = resolved.id;
  const activeSubpage = resolved.type === 'project' ? resolved.subpage || 'canvas' : null;

  const { items, flatFolders, loading, expanded, setExpanded, search, setSearch, fetchProjects, toggleExpand } =
    useProjectBrowserData(selectedOrg?.id);

  const { handleCreate, handleRename, handleDelete, handleMove, handleNavigateSubpage, handleOpen } =
    useProjectBrowserActions({
      items,
      flatFolders,
      fetchProjects,
      setExpanded,
      selectedOrg,
    });

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
