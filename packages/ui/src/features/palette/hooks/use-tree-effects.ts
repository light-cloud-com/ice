/**
 * Project Tree — orchestrator-level side-effects.
 *
 * Bundles the four `useEffect` blocks lifted from `../components/project-
 * tree.tsx` (rf-ptree-4):
 *
 *   1. **Fetch project tree on org change**: dispatches `fetchProjectTree`
 *      whenever `orgId` differs from `loadedOrgId`. The slice's reducer
 *      stamps `loadedOrgId` on success so we don't re-fetch on every render.
 *   2. **Focus edit input**: when `editingId` flips truthy and the edit-
 *      input ref is bound, focus + select() it so the user can immediately
 *      retype the project/folder name.
 *   3. **Focus new-folder input**: when `creatingFolder !== null` and the
 *      new-folder-input ref is bound, focus it.
 *   4. **Close context menu on outside click**: while `contextMenu` is
 *      non-null, listen for `mousedown` on document; if the click target
 *      is outside the menu, dispatch `setContextMenu(null)`.
 *
 * Returns the three refs (`menuRef`, `editInputRef`, `newFolderRef`) so the
 * orchestrator can thread them into the relevant DOM nodes.
 *
 * Mirrors the rf-pdpl-21 `useDeployEffects` pattern: a single hook bundles
 * multiple `useEffect`s with overlapping deps, with the deps array shape
 * acting as the per-effect fingerprint when tested. The
 * `fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook`
 * learning is the canonical reference.
 */

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { fetchProjectTree } from '../../../store/slices/projects-slice';
import type { AppDispatch } from '../../../store';

interface ContextMenuState {
  x: number;
  y: number;
  type: 'project' | 'folder';
  id: string;
}

export interface UseTreeEffectsArgs {
  orgId: string;
  loadedOrgId: string | null;
  editingId: string | null;
  creatingFolder: string | null;
  contextMenu: ContextMenuState | null;
  setContextMenu: (next: ContextMenuState | null) => void;
}

export interface UseTreeEffectsReturn {
  menuRef: React.RefObject<HTMLDivElement>;
  editInputRef: React.RefObject<HTMLInputElement>;
  newFolderRef: React.RefObject<HTMLInputElement>;
}

export function useTreeEffects(args: UseTreeEffectsArgs): UseTreeEffectsReturn {
  const { orgId, loadedOrgId, editingId, creatingFolder, contextMenu, setContextMenu } = args;
  const dispatch = useDispatch<AppDispatch>();
  const menuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // Fetch project tree from backend when org changes
  useEffect(() => {
    if (orgId && orgId !== loadedOrgId) {
      dispatch(fetchProjectTree(orgId));
    }
  }, [orgId, loadedOrgId, dispatch]);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Focus new-folder input when entering create-folder mode
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
  }, [contextMenu, setContextMenu]);

  return { menuRef, editInputRef, newFolderRef };
}
