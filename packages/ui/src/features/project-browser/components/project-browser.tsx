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
  Activity,
  Layers,
  Lock,
  GitPullRequest,
  Circle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState, useRef, memo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../../../shared/api/axios-instance';
import { useResolvePath } from '../../../shared/hooks/use-resolve-path';
import { toSlug } from '../../../shared/utils/slug';
import { openDialog } from '../../../store/slices/ui-slice';
import {
  fetchEnvironments,
  setActiveEnvironment,
  type Environment,
} from '../../../store/slices/environments-slice';
import { setActiveCard, importToActiveCard, createCard } from '../../../store/slices/cards-slice';
import { getApi } from '../../../shared/api/api-adapter';
import type { RootState, AppDispatch } from '../../../store';
import { PanelHeader, PanelHeaderAction } from '../../../shared/components/ui/panel-header';
import { useTranslation } from '../../../i18n';

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

    return (
      <>
        <button
          className={`group flex items-center w-full py-1 text-left text-ice-sm transition-colors focus-visible:ring-1 focus-visible:ring-blue-500 outline-none ${
            isActive ? 'text-ice-text-1 font-medium' : 'text-ice-text-2 hover:text-ice-text-1'
          }`}
          style={{ paddingLeft: `calc(${indent}px * var(--ice-space-scale, 1))` }}
          onClick={() => {
            if (isFolder) {
              onToggle(node.id);
            } else {
              onOpen(node);
              if (!isOpen) onToggle(node.id);
            }
          }}
        >
          {/* Chevron — separate click target for expand/collapse */}
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

          {!isFolder && node.cards.length > 0 && (
            <span className="ml-1.5 text-ice-xs text-ice-text-3/40 tabular-nums">{node.cards.length}</span>
          )}

          {/* Context menu — appears on hover */}
          <div className="ml-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label="More options"
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
        {isFolder && isOpen && node.children.map((child) => (
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

        {/* Project sub-pages */}
        {!isFolder && isOpen && (
          <ProjectSubPages
            node={node}
            level={level}
            isActive={isActive}
            activeSubpage={activeSubpage}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onNavigateSubpage={onNavigateSubpage}
          />
        )}
      </>
    );
  },
);

// ─── Project Sub-Pages with collapsible Environments ────────────────────────

const ProjectSubPages = memo(
  ({
    node,
    level,
    isActive,
    activeSubpage,
    expandedIds,
    onToggle,
    onNavigateSubpage,
  }: {
    node: ProjectNode;
    level: number;
    isActive: boolean;
    activeSubpage: string | null;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    onNavigateSubpage: (node: ProjectNode, subpage: string) => void;
  }) => {
    const { t } = useTranslation();
    const dispatch = useDispatch<AppDispatch>();
    const environments = useSelector((s: RootState) => s.environments.byProject[node.id] || []);
    const activeEnvId = useSelector((s: RootState) => s.environments.activeEnvId[node.id]);
    const envsExpanded = expandedIds.has(`env:${node.id}`);
    const padBase = (level + 1) * 12 + 20;

    // Fetch environments when project is expanded
    useEffect(() => {
      if (node.id) dispatch(fetchEnvironments(node.id));
    }, [node.id, dispatch]);

    const handleSwitchEnv = useCallback(
      async (env: Environment) => {
        dispatch(setActiveEnvironment({ projectId: node.id, envId: env.id }));
        try {
          const { store } = await import('../../../store');
          const state = store.getState();
          const existing = state.cards.cards.find((c: any) => c.id === env.card_id);
          if (existing && existing.nodes.length > 0) {
            dispatch(setActiveCard(env.card_id));
            return;
          }
          const api = getApi();
          const cardData = await api.graph.load(env.card_id);
          if (!cardData) return;
          if (!existing) dispatch(createCard({ name: cardData.name || env.name, id: cardData.id, projectId: node.id }));
          dispatch(setActiveCard(cardData.id));
          if (cardData.nodes?.length > 0 || cardData.edges?.length > 0) {
            dispatch(importToActiveCard({ nodes: cardData.nodes || [], edges: cardData.edges || [], skipAutoOrganize: true }));
          }
        } catch (err) {
          console.error('Failed to load environment card:', err);
        }
        // Navigate to canvas after switching
        onNavigateSubpage(node, 'canvas');
      },
      [node, dispatch, onNavigateSubpage],
    );

    const subPages = [
      { id: 'canvas', label: t('projectBrowser.subCanvas') },
      { id: 'table', label: t('projectBrowser.subTable') },
      { id: 'deployments', label: t('projectBrowser.subDeployments') },
      { id: 'activity', label: t('projectBrowser.subActivity') },
      { id: 'settings', label: t('projectBrowser.subSettings') },
    ];

    const indent = (level + 1) * 12 + 16;
    const envIndent = indent + 12;

    return (
      <div className="pb-1">
        {subPages.map((sub) => {
          const active = isActive && activeSubpage === sub.id;
          return (
            <button
              key={sub.id}
              className={`flex items-center w-full py-0.5 text-left text-ice-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                active
                  ? 'text-ice-text-1 font-medium'
                  : 'text-ice-text-3 hover:text-ice-text-2'
              }`}
              style={{ paddingLeft: `calc(${indent}px * var(--ice-space-scale, 1))` }}
              onClick={() => onNavigateSubpage(node, sub.id)}
            >
              {active && <span className="w-px h-3 bg-blue-400 rounded-full mr-2 shrink-0" />}
              {!active && <span className="w-px mr-2 shrink-0" />}
              <span>{sub.label}</span>
            </button>
          );
        })}

        {/* Environments — collapsible */}
        <button
          className={`flex items-center w-full py-0.5 text-left text-ice-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
            isActive && activeSubpage === 'environments'
              ? 'text-ice-text-1 font-medium'
              : 'text-ice-text-3 hover:text-ice-text-2'
          }`}
          style={{ paddingLeft: `calc(${indent}px * var(--ice-space-scale, 1))` }}
          onClick={() => {
            onToggle(`env:${node.id}`);
            onNavigateSubpage(node, 'environments');
          }}
        >
          {isActive && activeSubpage === 'environments'
            ? <span className="w-px h-3 bg-blue-400 rounded-full mr-1.5 shrink-0" />
            : <span className="w-px mr-1.5 shrink-0" />}
          <ChevronRight
            aria-hidden="true"
            className={`w-3 h-3 mr-1 shrink-0 text-ice-text-3/50 transition-transform duration-150 ${envsExpanded ? 'rotate-90' : ''}`}
          />
          <span>{t('projectBrowser.subEnvironments')}</span>
          {environments.length > 0 && (
            <span className="ml-1.5 text-ice-text-3/40 tabular-nums">{environments.length}</span>
          )}
        </button>

        {/* Individual environments */}
        {envsExpanded && environments.length > 0 && environments.map((env) => {
          const isActiveEnv = env.id === activeEnvId;
          const dotColor =
            env.type === 'production' ? 'bg-emerald-400'
            : env.type === 'staging' ? 'bg-amber-400'
            : env.type === 'pr' ? 'bg-purple-400'
            : 'bg-blue-400';
          return (
            <button
              key={env.id}
              className={`flex items-center w-full py-0.5 text-left text-ice-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                isActiveEnv
                  ? 'text-ice-text-1 font-medium'
                  : 'text-ice-text-3 hover:text-ice-text-2'
              }`}
              style={{ paddingLeft: `calc(${envIndent}px * var(--ice-space-scale, 1))` }}
              onClick={() => handleSwitchEnv(env)}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${dotColor}`} />
              <span className="truncate min-w-0">{env.name}</span>
              {env.is_protected && <Lock aria-hidden="true" className="w-2.5 h-2.5 ml-1 shrink-0 text-ice-text-3/30" />}
              {env.type === 'pr' && env.pr_number && (
                <span className="ml-1 text-purple-400/60">#{env.pr_number}</span>
              )}
            </button>
          );
        })}
      </div>
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
        name: type === 'folder' ? t('projectBrowser.newFolderName') : t('projectBrowser.newProjectName'),
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
      if (!window.confirm(t('projectBrowser.deleteConfirm'))) return;
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 custom-scrollbar">
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
