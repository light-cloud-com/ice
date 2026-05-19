/**
 * useRenameState
 *
 * Inline-rename state for canvas node labels. The orchestrator
 * (`svg-canvas.tsx`) wires three callbacks into the per-node renderer so
 * users can edit a node's display name in place:
 *
 *  - `handleNodeDoubleClick(nodeId)` starts an edit by setting
 *    `renamingNodeId` to the target node id.
 *  - `handleRenameCommit(nodeId, newLabel)` saves the trimmed name by
 *    dispatching `updateCardNodeData({ nodeId, data: { name } })` and
 *    then clears the editing state. An empty-string trim is treated as a
 *    cancel: the dispatch is skipped but `renamingNodeId` is still
 *    cleared, so the input closes either way.
 *  - `handleRenameCancel()` exits the edit without saving — only clears
 *    `renamingNodeId`.
 *
 * Behavior preserved verbatim from the inline `useState` + three
 * `useCallback` cluster previously in `svg-canvas.tsx` (rf-canv-20):
 *  - trim-then-check on commit,
 *  - empty / whitespace-only trim treated as cancel (no dispatch),
 *  - editing state ALWAYS clears on commit, regardless of whether the
 *    dispatch fired.
 *
 * rf-canv-20.
 */

import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateCardNodeData } from '../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../store';

export interface UseRenameStateResult {
  renamingNodeId: string | null;
  handleNodeDoubleClick: (nodeId: string) => void;
  handleRenameCommit: (nodeId: string, newLabel: string) => void;
  handleRenameCancel: () => void;
}

export function useRenameState(): UseRenameStateResult {
  const dispatch = useDispatch<AppDispatch>();

  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setRenamingNodeId(nodeId);
  }, []);

  const handleRenameCommit = useCallback(
    (nodeId: string, newLabel: string) => {
      if (newLabel.trim()) {
        dispatch(updateCardNodeData({ nodeId, data: { name: newLabel.trim() } }));
      }
      setRenamingNodeId(null);
    },
    [dispatch],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingNodeId(null);
  }, []);

  return {
    renamingNodeId,
    handleNodeDoubleClick,
    handleRenameCommit,
    handleRenameCancel,
  };
}
