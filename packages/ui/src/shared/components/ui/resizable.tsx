/**
 * Resizable Panel Components
 *
 * Based on react-resizable-panels
 */

import * as React from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '../../utils/cn';
import { ResizeBar } from './resize-bar';

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean;
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ice-accent focus-visible:ring-offset-1',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <>
        {/* Horizontal split → vertical bar */}
        <ResizeBar direction="vertical" className="[[data-panel-group-direction=vertical]_&]:hidden" />
        {/* Vertical split → horizontal bar */}
        <ResizeBar direction="horizontal" className="hidden [[data-panel-group-direction=vertical]_&]:block" />
      </>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
