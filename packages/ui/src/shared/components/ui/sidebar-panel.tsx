/**
 * SidebarPanel — Generic resizable sidebar used for left (palette) and right (properties/AI) panels.
 *
 * When expanded: resizable panel with drag handle.
 * When collapsed: WebStorm-style narrow strip with icon + vertical text.
 */

import React from 'react';
import { ResizableHandle, ResizablePanel } from './resizable';
import { SidebarStrip, type SidebarStripTab } from './sidebar-strip';

export type SidebarSide = 'left' | 'right';

export interface SidebarPanelProps {
  /** Whether the sidebar content is visible */
  visible: boolean;
  /** Which side of the layout */
  side: SidebarSide;
  /** Default width as % when visible */
  defaultSize: number;
  /** Minimum width as % when visible */
  minSize: number;
  /** Maximum width as % when visible */
  maxSize: number;
  /** Extra className on the panel */
  className?: string;
  /** Tabs shown in the collapsed strip when not visible */
  collapsedTabs?: SidebarStripTab[];
  /** Panel content */
  children: React.ReactNode;
}

/**
 * A collapsible sidebar panel with integrated resize handle.
 *
 * - When `visible=true`: resizable panel with drag handle.
 * - When `visible=false` and `collapsedTabs` provided: WebStorm-style icon strip.
 * - When `visible=false` and no `collapsedTabs`: completely hidden.
 */
export const SidebarPanel: React.FC<SidebarPanelProps> = ({
  visible,
  side,
  defaultSize,
  minSize,
  maxSize,
  className,
  collapsedTabs,
  children,
}) => {
  // Collapsed: show strip instead of panel
  if (!visible) {
    if (collapsedTabs && collapsedTabs.length > 0) {
      return <SidebarStrip side={side} tabs={collapsedTabs} />;
    }
    // No tabs — render invisible collapsed panel (maintains ResizablePanelGroup structure)
    return (
      <>
        {side === 'left' && (
          <>
            <ResizablePanel
              defaultSize={0}
              minSize={0}
              maxSize={0}
              collapsible
              collapsedSize={0}
              style={{ overflow: 'hidden' }}
            />
            <ResizableHandle withHandle />
          </>
        )}
        {side === 'right' && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={0}
              minSize={0}
              maxSize={0}
              collapsible
              collapsedSize={0}
              style={{ overflow: 'hidden' }}
            />
          </>
        )}
      </>
    );
  }

  // Expanded: resizable panel + handle
  const panel = (
    <ResizablePanel
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      collapsible
      collapsedSize={0}
      className={className}
    >
      {children}
    </ResizablePanel>
  );

  const handle = <ResizableHandle withHandle />;

  if (side === 'left') {
    return (
      <>
        {panel}
        {handle}
      </>
    );
  }

  return (
    <>
      {handle}
      {panel}
    </>
  );
};

