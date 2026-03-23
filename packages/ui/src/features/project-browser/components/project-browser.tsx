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
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  FolderPlus,
  FilePlus,
  FolderInput,
  Settings,
  Rocket,
  PenTool,
  Table2,
} from 'lucide-react';
import React, { useCallback, useEffect, useState, useRef, memo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../../shared/api/axios-instance';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { toSlug } from '../../../shared/utils/slug';
import { openDialog } from '../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../store';
import { SearchInput } from '../../../shared/components/ui/search-input';

interface ProjectNode {
  id: string;
  name: string;
  slug?: string;
  type: 'folder' | 'project';
  parent_id: string | null;
  cards: { id: string; name: string; updated_at: string }[];
  children: ProjectNode[];
}

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
    const isFolder = node.type === 'folder';
    const isOpen = expandedIds.has(node.id);
    const isActive = node.id === activeNodeId;
    const _hasChildren = node.children.length > 0;
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

    return (
      <>
        <div
          className={`group flex items-center h-7 px-2 py-1.5 rounded-md cursor-pointer ${isActive && (!activeSubpage || activeSubpage === 'canvas') ? 'bg-ice-active text-ice-text-1' : 'hover:bg-ice-hover'}`}
          style={{ paddingLeft: `${level * 12 + 4}px` }}
          onClick={() => {
            if (isFolder) {
              onToggle(node.id);
            } else {
              onOpen(node);
            }
          }}
        >
          {/* Chevron — click toggles expand independently */}
          <span
            className="w-4 h-4 flex items-center justify-center shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <ChevronRight
              className={`w-3 h-3 text-ice-text-3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
            />
          </span>

          {/* Icon */}
          <span className="w-4 h-4 flex items-center justify-center shrink-0 ml-0.5">
            {isFolder ? (
              isOpen ? (
                <FolderOpen className="w-[14px] h-[14px] text-amber-500" />
              ) : (
                <Folder className="w-[14px] h-[14px] text-amber-500" />
              )
            ) : (
              <FileText className="w-[14px] h-[14px] text-blue-400/50" />
            )}
          </span>

          {/* Name */}
          <span className="flex-1 ml-1.5 min-w-0">
            {isRenaming ? (
              <input
                ref={inputRef}
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
                className="w-full bg-transparent text-ice-md text-ice-text-1 outline-none border-b border-blue-500/50"
              />
            ) : (
              <span className="text-ice-md text-ice-text-2 truncate block leading-tight">{node.name}</span>
            )}
          </span>

          {/* Card count badge */}
          {!isFolder && node.cards.length > 0 && (
            <span className="text-ice-xs text-ice-text-3 tabular-nums mr-1">{node.cards.length}</span>
          )}

          {/* Context menu */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="p-0.5 rounded hover:bg-ice-active outline-none">
                  <MoreVertical className="w-3.5 h-3.5 text-ice-text-3" />
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
                      <FilePlus className="w-3.5 h-3.5 text-ice-text-3" />
                      New project here
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    onClick={() => {
                      setRenameValue(node.name);
                      setIsRenaming(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                  >
                    <Pencil className="w-3.5 h-3.5 text-ice-text-3" />
                    Rename
                  </DropdownMenu.Item>

                  {/* Move submenu */}
                  {availableFolders.length > 0 && (
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active">
                        <FolderInput className="w-3.5 h-3.5 text-ice-text-3" />
                        Move to
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
                            Root
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
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Folder children */}
        {isFolder && isOpen && (
          <div className="ml-4 border-l border-ice-border pl-2">
            {node.children.map((child) => (
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
          </div>
        )}

        {/* Project sub-pages */}
        {!isFolder && isOpen && (
          <div className="ml-4 border-l border-ice-border pl-2 ">
            {[
              { id: 'canvas', label: 'Canvas', icon: PenTool },
              { id: 'table', label: 'Table', icon: Table2 },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'deployments', label: 'Deployments', icon: Rocket },
            ].map((sub) => (
              <div
                key={sub.id}
                className={`flex items-center h-6 px-1 my-1 rounded-md cursor-pointer transition-colors ${
                  isActive && activeSubpage === sub.id
                    ? 'bg-ice-active text-ice-text-1'
                    : 'text-ice-text-3 hover:bg-ice-hover hover:text-ice-text-2'
                }`}
                style={{ paddingLeft: `${(level + 1) * 12 + 20}px` }}
                onClick={() => onNavigateSubpage(node, sub.id)}
              >
                <sub.icon className="w-3 h-3 mr-1.5 shrink-0" />
                <span className="text-ice-sm">{sub.label}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  },
);

// ─── Main Component ─────────────────────────────────────────────────────────

export function ProjectBrowser() {
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

  const fetchProjects = useCallback(async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const res = await axiosInstance.post('/canvas/projects', {
        organisationId: selectedOrg.id,
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
  }, [selectedOrg, search]);

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
        name: type === 'folder' ? 'New Folder' : 'New Project',
        type,
        parentId: parentId || null,
        organisationId: selectedOrg.id,
      });
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      fetchProjects();
    },
    [selectedOrg, fetchProjects],
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
      if (!window.confirm('Delete this item?')) return;
      await axiosInstance.post('/canvas/projects/delete', { projectId: id, organisationId: selectedOrg?.id });
      fetchProjects();
    },
    [selectedOrg, fetchProjects],
  );

  const handleMove = useCallback(
    async (id: string, parentId: string | null) => {
      await axiosInstance.post('/canvas/projects/move', { projectId: id, parentId });
      fetchProjects();
    },
    [fetchProjects],
  );

  // Build URL path by walking up the tree from a node
  const buildPath = useCallback(
    (node: ProjectNode, allItems: ProjectNode[]): string => {
      const parts: string[] = [];
      let current: ProjectNode | undefined = node;

      // Walk up via parent_id to build full path
      while (current) {
        const slug =
          current.slug ||
          current.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        parts.unshift(slug);
        if (current.parent_id) {
          current = allItems.find((n) => n.id === current!.parent_id);
        } else {
          break;
        }
      }

      // Prepend org slug
      const orgSlug = selectedOrg ? toSlug(selectedOrg.name) : '';
      return orgSlug ? `/${orgSlug}/${parts.join('/')}` : '/' + parts.join('/');
    },
    [selectedOrg],
  );

  const handleNavigateSubpage = useCallback(
    (node: ProjectNode, subpage: string) => {
      const allFlat = flatFolders.concat(
        items.flatMap(function flatten(n: ProjectNode): ProjectNode[] {
          return [n, ...(n.children || []).flatMap(flatten)];
        }),
      );
      const path = buildPath(node, allFlat);
      // Canvas is the default view — no suffix needed
      navigate(subpage === 'canvas' ? path : `${path}/${subpage}`);
    },
    [buildPath, flatFolders, items, navigate],
  );

  const handleOpen = useCallback(
    (node: ProjectNode) => {
      // Build the URL path and navigate
      const path = buildPath(
        node,
        flatFolders.concat(
          items.flatMap(function flatten(n: ProjectNode): ProjectNode[] {
            return [n, ...(n.children || []).flatMap(flatten)];
          }),
        ),
      );
      navigate(path);
    },
    [buildPath, flatFolders, items, navigate],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search + Actions */}
      <div className="px-3 py-2 space-y-1.5">
        <SearchInput value={search} onChange={setSearch} />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => dispatch(openDialog('projectWizard'))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-ice-sm font-medium rounded bg-ice-accent-muted text-ice-accent hover:bg-ice-accent hover:text-white transition-colors flex-1 justify-center"
          >
            <FilePlus className="w-3 h-3" />
            New Project
          </button>
          <button
            onClick={() => handleCreate('folder')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-ice-sm font-medium rounded bg-ice-hover text-ice-text-2 hover:bg-ice-active transition-colors"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-4 h-4 animate-spin text-ice-text-3" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Folder className="w-8 h-8 text-white/10 mb-2" />
            <p className="text-ice-base text-ice-text-3 mb-3">No projects yet</p>
            <button
              onClick={() => dispatch(openDialog('projectWizard'))}
              className="px-3 py-1 text-ice-sm font-medium rounded bg-ice-accent text-white hover:bg-ice-accent-hover transition-[background-color]"
            >
              Create project
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
