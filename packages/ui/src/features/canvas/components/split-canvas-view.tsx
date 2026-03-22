/**
 * Split Canvas View Component
 *
 * Container for split view functionality. Renders one or two CanvasPane
 * components based on split state, using react-resizable-panels for resizing.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../../../shared/components/ui/resizable';
import { CanvasPane } from './canvas-pane';
import type { RootState } from '../../../store';

export const SplitCanvasView: React.FC = () => {
  const splitView = useSelector((state: RootState) => state.ui.splitView);
  const { enabled, direction, panes, activePaneId } = splitView;

  // Single pane mode
  if (!enabled || panes.length === 1) {
    const pane = panes[0];
    return (
      <div className="h-full">
        <CanvasPane paneId={pane.id} cardId={pane.cardId} isActive={true} showCloseButton={false} />
      </div>
    );
  }

  // Split mode - two panes
  const panelDirection = direction === 'horizontal' ? 'horizontal' : 'vertical';

  return (
    <ResizablePanelGroup direction={panelDirection} className="h-full">
      {/* Primary pane */}
      <ResizablePanel defaultSize={50} minSize={20}>
        <CanvasPane
          paneId={panes[0].id}
          cardId={panes[0].cardId}
          isActive={panes[0].id === activePaneId}
          showCloseButton={true}
        />
      </ResizablePanel>

      {/* Resize handle */}
      <ResizableHandle withHandle />

      {/* Secondary pane */}
      <ResizablePanel defaultSize={50} minSize={20}>
        <CanvasPane
          paneId={panes[1].id}
          cardId={panes[1].cardId}
          isActive={panes[1].id === activePaneId}
          showCloseButton={true}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export default SplitCanvasView;
