/**
 * Tree Item — leaf component for the Project Browser tree.
 *
 * One row per folder/project, recursive: when isFolder && isOpen, renders
 * its children below. Wraps a button that handles click (toggle expand for
 * folders, open for projects), drag/drop (folders only — accept any tree
 * item id and call onMove), and an inline rename input that flips on
 * via the dropdown menu. The dropdown also exposes "New project here"
 * (folders only), "Move to" (any folder), and "Delete".
 *
 * Extracted verbatim from `project-browser.tsx` during rf-pbrws-2.
 * Kept memo-wrapped so the tree-walker tests can match by reference; tests
 * unwrap the inner FC via `.type` for direct invocation. Behavior preserved
 * byte-for-byte: click handlers, drag-image cloning, drag-over highlight
 * gating, rename submit semantics, and recursive child rendering.
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  FilePlus,
  FolderInput,
  Layers,
} from 'lucide-react';
import React, { useEffect, useRef, useState, memo } from 'react';
import { useTranslation } from '../../../i18n';
import type { ProjectNode } from '../types/project-node';

// IA5 — project subpages, mirroring the toolbar's SUB_PAGES, so they're reachable
// from the tree context menu (the onNavigateSubpage handler existed but was never
// bound to a clickable affordance).
const PROJECT_SUBPAGES: { id: string; i18nKey: string }[] = [
  { id: 'canvas', i18nKey: 'projectBrowser.subCanvas' },
  { id: 'table', i18nKey: 'projectBrowser.subTable' },
  { id: 'deployments', i18nKey: 'projectBrowser.subDeployments' },
  { id: 'activity', i18nKey: 'projectBrowser.subActivity' },
];

export interface TreeItemProps {
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
}

export const TreeItem = memo(
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
  }: TreeItemProps) => {
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
                  {/* IA5 — open a specific project subpage (Canvas / Table /
                      Deployments / Activity) from the tree, not just the toolbar. */}
                  {!isFolder && (
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active">
                        <Layers aria-hidden="true" className="w-3.5 h-3.5 text-ice-text-3" />
                        {t('projectBrowser.contextOpen')}
                        <ChevronRight className="w-3 h-3 ml-auto text-ice-text-3" />
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent
                          sideOffset={4}
                          className="z-[99999] min-w-[140px] rounded-md border border-ice-border bg-ice-overlay p-1 shadow-xl"
                        >
                          {PROJECT_SUBPAGES.map((page) => (
                            <DropdownMenu.Item
                              key={page.id}
                              onClick={() => onNavigateSubpage(node, page.id)}
                              className="flex items-center gap-2 px-3 py-1.5 text-ice-md text-ice-text-2 rounded cursor-pointer outline-none hover:bg-ice-active"
                            >
                              {t(page.i18nKey)}
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
TreeItem.displayName = 'TreeItem';
