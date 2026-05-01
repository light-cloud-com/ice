/**
 * Project Browser — Clean hierarchical folder/project tree
 *
 * Matches platform editor's sidebar style.
 * Scoped to selected organisation.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  FolderPlus,
  FilePlus,
  FolderInput,
  Layers,
} from 'lucide-react';
import React, { useCallback, useEffect, useState, useRef, memo } from 'react';
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

// ─── Tree Item ──────────────────────────────────────────────────────────────

const TreeItem = memo(
  ({
    node,
    level,
    expandedIds,
    activeNodeId,
    activeSubpage,
    onToggle,
    onOpen,
    onNavigateSubpage,
    onRename,
    onDelete,
    onCreateIn,
    onMove,
    allFolders,
  }: {
    node: ProjectNode;
    level: number;
    expandedIds: Set<string>;
    activeNodeId: string | null;
    activeSubpage: string | null;
    onToggle: (id: string) => void;
    onOpen: (node: ProjectNode) => void;
    onNavigateSubpage: (node: ProjectNode, subpage: string) => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onCreateIn: (parentId: string) => void;
    onMove: (id: string, parentId: string | null) => void;
    allFolders: ProjectNode[];
  }) => {
    const { t } = useTranslation();
    const isFolder = node.type === 'folder';
    const isOpen = expandedIds.has(node.id);
    const isActive = node.id === activeNodeId;
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(node.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (isRenaming) inputRef.current?.select();
    }, [isRenaming]);

    const handleRenameSubmit = () => {
      if (renameValue.trim() && renameValue !== node.name) {
        onRename(node.id, renameValue.trim());
      }
      setIsRenaming(false);
    };

    const availableFolders = allFolders.filter((f) => f.id !== node.id);

    const indent = level * 14 + 8;
    const [isDragOver, setIsDragOver] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    return (
      <>
        <button
          draggable={!isRenaming}
          onDragStart={(e) => {
            e.dataTransfer.setData('application/ice-tree-id', node.id);
            e.dataTransfer.effectAllowed = 'move';
            setIsDragging(true);
            // Set a ghost image with slight transparency
            if (e.currentTarget) {
              const el = e.currentTarget as HTMLElement;
              const ghost = el.cloneNode(true) as HTMLElement;
              ghost.style.opacity = '0.8';
              ghost.style.position = 'absolute';
              ghost.style.top = '-1000px';
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 0, 0);
              requestAnimationFrame(() => document.body.removeChild(ghost));
            }
          }}
          onDragEnd={() => setIsDragging(false)}
          onDragOver={(e) => {
            if (!isFolder) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            // Only clear if actually leaving this element (not entering a child)
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDragOver(false);
            }
          }}
          onDrop={(e) => {
            if (!isFolder) return;
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            const draggedId = e.dataTransfer.getData('application/ice-tree-id');
            if (draggedId && draggedId !== node.id) {
              onMove(draggedId, node.id);
              if (!isOpen) onToggle(node.id);
            }
          }}
          className={`group flex items-center w-full py-1 rounded-md text-left text-ice-sm focus-visible:ring-1 focus-visible:ring-blue-500 outline-none ${
            isDragging
              ? 'opacity-40'
              : isDragOver && isFolder
                ? 'bg-blue-500/15 ring-1 ring-blue-500/30 text-blue-400'
                : isActive
                  ? 'text-ice-text-1 font-medium'
                  : 'text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover/50'
          }`}
          style={{ paddingLeft: `calc(${indent}px * var(--ice-space-scale, 1))` }}
          onClick={() => {
            if (isFolder) {
              onToggle(node.id);
            } else {
              onOpen(node);
            }
          }}
        >
          {/* Chevron — only for folders */}
          {isFolder ? (
            <span
              className="w-4 h-4 flex items-center justify-center shrink-0 -ml-0.5 mr-0.5 rounded hover:bg-ice-hover"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.id);
              }}
            >
              <ChevronRight
                aria-hidden="true"
                className={`w-3 h-3 text-ice-text-3/50 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
              />
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* Node icon */}
          {isFolder ? (
            isOpen ? (
              <FolderOpen aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mr-1.5 text-amber-400/70" />
            ) : (
              <Folder aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mr-1.5 text-amber-400/70" />
            )
          ) : (
            <Layers aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mr-1.5 text-ice-text-3" />
          )}

          {isRenaming ? (
            <input
              ref={inputRef}
              name="rename"
              autoComplete="off"
              spellCheck={false}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') {
                  setRenameValue(node.name);
                  setIsRenaming(false);
                }
              }}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-transparent text-ice-sm text-ice-text-1 border-b border-blue-500/50 outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            />
          ) : (
            <span className="truncate min-w-0">{node.name}</span>
          )}

          {/* Context menu — appears on hover */}
          <div
            className="ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label={t('projectBrowser.moreOptions')}
                  className="p-0.5 rounded hover:bg-ice-active focus-visible:ring-1 focus-visible:ring-blue-500 outline-none"
                >
                  <MoreVertical aria-hidden="true" className="w-3 h-3 text-ice-text-3/50" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-[99999] min-w-[160px] rounded-md border border-ice-border bg-ice-overlay p-1 shadow-xl"
                >
                  {isFolder && (
                    <DropdownMenu.Item
                      onClick={() => onCreateIn(node.id)}
                      className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                    >
                      <FilePlus aria-hidden="true" className="w-3.5 h-3.5 text-ice-text-3" />
                      {t('projectBrowser.contextNewProjectHere')}
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    onClick={() => {
                      setRenameValue(node.name);
                      setIsRenaming(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                  >
                    <Pencil aria-hidden="true" className="w-3.5 h-3.5 text-ice-text-3" />
                    {t('projectBrowser.contextRename')}
                  </DropdownMenu.Item>
                  {availableFolders.length > 0 && (
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active">
                        <FolderInput aria-hidden="true" className="w-3.5 h-3.5 text-ice-text-3" />
                        {t('projectBrowser.contextMoveTo')}
                        <ChevronRight className="w-3 h-3 ml-auto text-ice-text-3" />
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent
                          sideOffset={4}
                          className="z-[99999] min-w-[140px] rounded-md border border-ice-border bg-ice-overlay p-1 shadow-xl"
                        >
                          <DropdownMenu.Item
                            onClick={() => onMove(node.id, null)}
                            className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                          >
                            {t('projectBrowser.contextMoveRoot')}
                          </DropdownMenu.Item>
                          {availableFolders.map((f) => (
                            <DropdownMenu.Item
                              key={f.id}
                              onClick={() => onMove(node.id, f.id)}
                              className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                            >
                              <Folder className="w-3 h-3 text-amber-500/50" />
                              {f.name}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                  )}
                  <DropdownMenu.Separator className="h-px my-1 bg-ice-active" />
                  <DropdownMenu.Item
                    onClick={() => onDelete(node.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-red-400 rounded cursor-pointer outline-none hover:bg-red-500/10"
                  >
                    <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                    {t('projectBrowser.contextDelete')}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </button>

        {/* Folder children */}
        {isFolder &&
          isOpen &&
          node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              activeNodeId={activeNodeId}
              activeSubpage={activeSubpage}
              onToggle={onToggle}
              onOpen={onOpen}
              onNavigateSubpage={onNavigateSubpage}
              onRename={onRename}
              onDelete={onDelete}
              onCreateIn={onCreateIn}
              onMove={onMove}
              allFolders={allFolders}
            />
          ))}
      </>
    );
  },
);

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
