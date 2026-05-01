/**
 * Project Tree — drag-and-drop handler bundle.
 *
 * Extracted from `../components/project-tree.tsx` (rf-ptree-3). Bundles the
 * four `useCallback` drag handlers — start, over, leave, drop — into a
 * custom hook so the orchestrator stays focused on layout.
 *
 * The hook owns the `dragOverId` state internally (it's a pure-DnD concern
 * — the orchestrator never reads or writes it outside of drag interactions),
 * which lets the hook return the value alongside the four handlers without
 * the orchestrator passing setters in. Mirrors the rf-pdpl-21
 * `useDeployEffects.logEndRef`-owns-the-ref pattern: state local to the
 * extracted concern lives in the extracted module.
 *
 * Behavior preserved verbatim:
 *   - drag-start sets `text/plain` to `encodeDrag(type, id)` and
 *     `effectAllowed = 'move'`.
 *   - drag-over preventDefaults + stopPropagates, sets `dropEffect = 'move'`,
 *     and tracks the hovered target id (null = root).
 *   - drag-leave stopPropagates + clears the target id.
 *   - drop preventDefaults + stopPropagates, decodes the payload, and
 *     dispatches `moveProjectToFolder` or `moveFolder`. Self-drop on a
 *     folder (item.id === targetFolderId) is rejected silently.
 */

import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import { moveProjectToFolder, moveFolder } from '../../../store/slices/projects-slice';
import type { AppDispatch } from '../../../store';
import { encodeDrag, decodeDrag, type DragItemType } from '../utils/drag-encoding';

export interface UseTreeDragOutput {
  dragOverId: string | null;
  handleDragStart: (e: React.DragEvent, type: DragItemType, id: string) => void;
  handleDragOver: (e: React.DragEvent, targetFolderId: string | null) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetFolderId: string | null) => void;
}

export function useTreeDrag(): UseTreeDragOutput {
  const dispatch = useDispatch<AppDispatch>();
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, type: DragItemType, id: string) => {
    e.dataTransfer.setData('text/plain', encodeDrag(type, id));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(targetFolderId);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetFolderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverId(null);
      const raw = e.dataTransfer.getData('text/plain');
      const item = decodeDrag(raw);
      if (!item) return;

      if (item.type === 'project') {
        dispatch(moveProjectToFolder({ projectId: item.id, folderId: targetFolderId }));
      } else if (item.type === 'folder') {
        // Don't drop a folder into itself
        if (item.id === targetFolderId) return;
        dispatch(moveFolder({ folderId: item.id, parentFolderId: targetFolderId }));
      }
    },
    [dispatch],
  );

  return { dragOverId, handleDragStart, handleDragOver, handleDragLeave, handleDrop };
}
