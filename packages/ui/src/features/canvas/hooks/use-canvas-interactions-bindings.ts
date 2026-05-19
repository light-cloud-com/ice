/**
 * useCanvasInteractionsBindings
 *
 * Thin wrapper around `useCanvasInteractions` that pre-bundles the
 * orchestrator-side callbacks (selection dispatchers + grid-size ternary)
 * so the orchestrator's call site is a single hook invocation instead
 * of a ~25-line useCanvasInteractions call with nested arrow functions.
 *
 * Inline callback bodies preserved verbatim:
 *   - onSelect → setSelectedNodes(ids) + setSelectedEdges([])
 *   - onToggleSelect → toggleNodeSelection(id) + setSelectedEdges([])
 *   - onBoxSelect → setSelectionRect(rect)
 *
 * The `gridSize: snapToGrid ? GRID_SIZE : 0` ternary moves here too —
 * snapToGrid is the only thing the wrapper consults beyond what
 * useCanvasInteractions already takes.
 *
 * rf-svgcv2-3.
 */

import { useDispatch } from 'react-redux';

import {
  setSelectedNodes,
  setSelectedEdges,
  toggleNodeSelection,
  setSelectionRect,
} from '../../../store/slices/selection-slice';
import { GRID_SIZE } from '../../../config/canvas-constants';
import { useCanvasInteractions } from './use-canvas-interactions';
import type { AppDispatch } from '../../../store';

type UseCanvasInteractionsArgs = Parameters<typeof useCanvasInteractions>[0];

/** Subset of `useCanvasInteractions` args the orchestrator owns directly
 *  (i.e. not derived from selection-slice / snapToGrid). */
type PassThroughArgs = Omit<
  UseCanvasInteractionsArgs,
  'onSelect' | 'onToggleSelect' | 'onBoxSelect' | 'gridSize'
>;

export interface UseCanvasInteractionsBindingsArgs extends PassThroughArgs {
  /** Whether the user has snap-to-grid enabled in the toolbar. When
   *  true, the wrapper passes GRID_SIZE; when false, 0 (snap disabled). */
  snapToGrid: boolean;
}

export function useCanvasInteractionsBindings(
  args: UseCanvasInteractionsBindingsArgs,
): ReturnType<typeof useCanvasInteractions> {
  const { snapToGrid, ...passThrough } = args;
  const dispatch = useDispatch<AppDispatch>();

  return useCanvasInteractions({
    ...passThrough,
    onSelect: (ids) => {
      dispatch(setSelectedNodes(ids));
      dispatch(setSelectedEdges([]));
    },
    onToggleSelect: (id) => {
      dispatch(toggleNodeSelection(id));
      dispatch(setSelectedEdges([]));
    },
    onBoxSelect: (rect) => {
      dispatch(setSelectionRect(rect));
    },
    gridSize: snapToGrid ? GRID_SIZE : 0,
  });
}
