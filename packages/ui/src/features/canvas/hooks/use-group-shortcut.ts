/**
 * useGroupShortcut
 *
 * Window-level Cmd+G / Ctrl+J listener that wraps the current node
 * selection in a `Group.Custom` container. Backed by the existing
 * `groupSelectedNodes` reducer in the cards slice, so the operation
 * is undoable for free.
 *
 * Ignored while an input/textarea is focused (so Cmd+G in the
 * properties panel finds the next match in the browser's native
 * find-in-page instead of grouping nodes the user can't see).
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { groupSelectedNodes } from '../../../store/slices/cards-slice';
import type { AppDispatch, RootState } from '../../../store';

export function useGroupShortcut(): void {
  const dispatch = useDispatch<AppDispatch>();
  const selectedNodeIds = useSelector((s: RootState) => s.selection.selectedNodes);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;

      // Cmd+G on Mac, Ctrl+J on Windows/Linux (Blender's frame-around-
      // selection binding is Ctrl+J — Cmd+G is the Mac convention for
      // "group these things together").
      const isCmdG = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && !e.shiftKey;
      const isCtrlJ = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !e.shiftKey;
      if (!isCmdG && !isCtrlJ) return;
      if (selectedNodeIds.length < 2) return;
      e.preventDefault();
      dispatch(groupSelectedNodes(selectedNodeIds));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, selectedNodeIds]);
}
