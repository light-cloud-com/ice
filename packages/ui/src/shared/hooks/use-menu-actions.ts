/**
 * Menu Actions Hook
 *
 * Handles menu events from the main process.
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { initializeGraph, loadGraph, saveGraph, undo, redo } from '../../store/slices/graph-slice';
import { togglePalette, toggleProperties, toggleMinimap } from '../../store/slices/ui-slice';
import { clearSelection, selectAll } from '../../store/slices/selection-slice';
import { getApi } from '../api/api-adapter';
import type { AppDispatch, RootState } from '../../store';

export function useMenuActions() {
  const dispatch = useDispatch<AppDispatch>();
  const { nodes, edges } = useSelector((state: RootState) => state.graph);

  useEffect(() => {
    const api = getApi();

    const cleanup = api.onMenuAction(async (action: string) => {
      switch (action) {
        case 'menu:newGraph':
          dispatch(initializeGraph());
          break;

        case 'menu:openGraph': {
          const filePath = await api.dialog.openFile();
          if (filePath) {
            dispatch(loadGraph(filePath));
          }
          break;
        }

        case 'menu:saveGraph':
          dispatch(saveGraph());
          break;

        case 'menu:saveGraphAs': {
          const savePath = await api.dialog.saveFile();
          if (savePath) {
            dispatch(saveGraph(savePath));
          }
          break;
        }

        case 'menu:importTerraform':
          // Not yet implemented — see roadmap for import dialog support
          break;

        // Edit Menu
        case 'menu:undo':
          dispatch(undo());
          break;

        case 'menu:redo':
          dispatch(redo());
          break;

        case 'menu:selectAll':
          dispatch(
            selectAll({
              nodes: nodes.map((n) => n.id),
              edges: edges.map((e) => e.id),
            })
          );
          break;

        case 'menu:deselectAll':
          dispatch(clearSelection());
          break;

        case 'menu:deleteSelected':
          // Not yet implemented — requires wiring to cardsSlice deleteCardNode
          break;

        // View Menu
        case 'menu:zoomIn':
          // Handled by SvgCanvas keyboard shortcuts
          break;

        case 'menu:zoomOut':
          // Handled by SvgCanvas keyboard shortcuts
          break;

        case 'menu:fitToScreen':
          // Handled by SvgCanvas keyboard shortcuts
          break;

        case 'menu:toggleMinimap':
          dispatch(toggleMinimap());
          break;

        case 'menu:togglePalette':
          dispatch(togglePalette());
          break;

        case 'menu:toggleProperties':
          dispatch(toggleProperties());
          break;

        case 'menu:autoLayout':
          // Not yet implemented — requires wiring to cardsSlice autoOrganizeCard
          break;

        // Graph Menu
        case 'menu:validate':
          // Not yet implemented — requires wiring to graph:validate IPC
          break;

        case 'menu:groupSelected':
          // Not yet implemented — requires group node creation logic
          break;

        default:
          console.log('Unhandled menu action:', action);
      }
    });

    return cleanup;
  }, [dispatch, nodes, edges]);
}
