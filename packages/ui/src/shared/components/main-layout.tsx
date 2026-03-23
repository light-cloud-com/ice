/**
 * Main Layout — sidebar + center content + properties
 *
 * Center content switches between Canvas and Table view.
 * Properties panel goes to the right on landscape, bottom on portrait.
 * AI chat sits below the canvas, full width, expand/collapse in place.
 *
 * Collapsed sidebars show a WebStorm-style narrow strip with icons + vertical text.
 */

import { FolderOpen, Blocks, PanelRight, MessageSquare } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { InlineTableView } from './inline-table-view';
import { StatusBar } from './status-bar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';
import { SidebarPanel } from './ui/sidebar-panel';
import { SidebarStrip } from './ui/sidebar-strip';
import { AiChatPanel, AiChatCollapsedBar } from '../../features/ai/components/ai-chat-panel';
import { SvgCanvas } from '../../features/canvas/components/svg-canvas';
import { EnvironmentTabBar } from '../../features/environments/components/environment-tab-bar';
import { ResourcePalette } from '../../features/palette/components/resource-palette';
import { PropertiesPanel } from '../../features/properties/components/properties-panel';
import { createCard, importToActiveCard, setActiveCard } from '../../store/slices/cards-slice';
import { togglePalette, toggleBlocks, toggleProperties, toggleAiChat } from '../../store/slices/ui-slice';
import axiosInstance from '../api/axios-instance';
import type { RootState, AppDispatch } from '../../store';
import type { SidebarStripTab } from './ui/sidebar-strip';

interface MainLayoutProps {
  projectId?: string;
  projectName?: string;
  view?: 'canvas' | 'table';
  basePath?: string;
  children?: React.ReactNode;
}

function useIsPortrait() {
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isPortrait;
}

// ── DragResizePanel — sidebar with independent drag handle ──────────────────

interface DragResizePanelProps {
  side: 'left' | 'right';
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  children: React.ReactNode;
}

const DragResizePanel: React.FC<DragResizePanelProps> = ({
  side,
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  children,
}) => {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? Math.max(minWidth, Math.min(maxWidth, parseInt(saved, 10))) : defaultWidth;
  });
  const dragging = React.useRef(false);
  const startX = React.useRef(0);
  const startW = React.useRef(0);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = side === 'left' ? e.clientX - startX.current : startX.current - e.clientX;
      const newW = Math.max(minWidth, Math.min(maxWidth, startW.current + delta));
      setWidth(newW);
    },
    [side, minWidth, maxWidth],
  );

  const onPointerUp = React.useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const handle = (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors"
    />
  );

  return (
    <div className="h-full flex shrink-0" style={{ width }}>
      {side === 'right' && handle}
      <div className={`flex-1 min-w-0 overflow-hidden bg-ice-surface ${side === 'left' ? 'ice-sidebar-shadow' : ''}`}>
        {children}
      </div>
      {side === 'left' && handle}
    </div>
  );
};

// ── MainLayout ──────────────────────────────────────────────────────────────

export const MainLayout: React.FC<MainLayoutProps> = ({
  projectId,
  projectName,
  view = 'canvas',
  basePath,
  children,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { showPalette, showBlocks, showProperties, showAiChat } = useSelector((state: RootState) => state.ui);
  const isPortrait = useIsPortrait();
  const isCanvasView = view === 'canvas' && !children;

  const loadedProjectRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (loadedProjectRef.current === projectId) return;
    loadedProjectRef.current = projectId;

    const loadProject = async () => {
      try {
        const res = await axiosInstance.post('/canvas/projects/get', { projectId });
        const project = res.data;
        const environments = project.environments || [];
        const cards = project.cards || [];

        if (environments.length > 0) {
          const prodEnv = environments.find((e: any) => e.type === 'production');
          const cardId = prodEnv?.card_id || cards[0]?.id;
          if (cardId) {
            await loadCard(cardId, projectId);
          }
          return;
        }

        if (cards.length > 0) {
          await loadCard(cards[0].id, projectId);
        } else {
          const cardRes = await axiosInstance.post('/canvas/cards/create', {
            name: projectName || 'Canvas',
            projectId,
          });
          dispatch(createCard({ name: projectName || 'Canvas', id: cardRes.data.id, projectId }));
          dispatch(setActiveCard(cardRes.data.id));
        }
      } catch (err) {
        console.error('Failed to load project:', err);
      }
    };

    const loadCard = async (cardId: string, projId: string) => {
      const state = (await import('../../store')).store.getState();
      const existingCard = state.cards.cards.find((c: any) => c.id === cardId);

      if (existingCard && existingCard.nodes.length > 0) {
        dispatch(setActiveCard(cardId));
      } else {
        const cardRes = await axiosInstance.post('/canvas/cards/get', { cardId });
        const card = cardRes.data;
        if (!existingCard) {
          dispatch(createCard({ name: card.name, id: card.id, projectId: projId }));
        }
        dispatch(setActiveCard(card.id));
        if (card.nodes?.length > 0 || card.edges?.length > 0) {
          dispatch(importToActiveCard({ nodes: card.nodes || [], edges: card.edges || [] }));
        }
      }
    };

    loadProject();
  }, [projectId, projectName, dispatch]);

  // ── Collapsed strip tabs ────────────────────────────────────────────────

  const leftStripTabs: SidebarStripTab[] = useMemo(
    () => [
      {
        id: 'project',
        label: 'Project',
        icon: FolderOpen,
        active: showPalette,
        onClick: () => dispatch(togglePalette()),
      },
      {
        id: 'blocks',
        label: 'Blocks',
        icon: Blocks,
        active: showBlocks,
        onClick: () => dispatch(toggleBlocks()),
      },
    ],
    [showPalette, showBlocks, dispatch],
  );

  const rightStripTabs: SidebarStripTab[] = useMemo(() => {
    const tabs: SidebarStripTab[] = [];
    tabs.push({
      id: 'properties',
      label: 'Properties',
      icon: PanelRight,
      active: showProperties,
      onClick: () => dispatch(toggleProperties()),
    });
    if (isCanvasView) {
      tabs.push({
        id: 'ai',
        label: 'AI Chat',
        icon: MessageSquare,
        active: showAiChat,
        onClick: () => dispatch(toggleAiChat()),
      });
    }
    return tabs;
  }, [showProperties, showAiChat, isCanvasView, dispatch]);

  // ── Content ─────────────────────────────────────────────────────────────

  const canvasContent = (
    <div className="h-full flex flex-col">
      {projectId && basePath && <EnvironmentTabBar projectId={projectId} basePath={basePath} />}
      <div className="flex-1 min-h-0 relative">
        {children ? children : view === 'table' ? <InlineTableView /> : <SvgCanvas />}
      </div>
      {isCanvasView && !showAiChat && <AiChatCollapsedBar />}
    </div>
  );

  const showLeftPanel = showPalette || showBlocks;
  const showRightPanel = showProperties || (isCanvasView && showAiChat);

  const rightPanelContent =
    showProperties && isCanvasView && showAiChat ? (
      <ResizablePanelGroup direction="vertical" autoSaveId="ice-right-panels">
        <ResizablePanel defaultSize={50} minSize={25}>
          <AiChatPanel />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50} minSize={25}>
          <PropertiesPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : isCanvasView && showAiChat ? (
      <AiChatPanel />
    ) : (
      <PropertiesPanel />
    );

  // ── Portrait layout ─────────────────────────────────────────────────────

  if (isPortrait) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-hidden flex">
          {/* Left collapsed strip */}
          <SidebarStrip side="left" tabs={leftStripTabs} />

          <ResizablePanelGroup direction="horizontal" className="h-full flex-1" autoSaveId="ice-layout-h-v2">
            <SidebarPanel
              visible={showLeftPanel}
              side="left"
              defaultSize={25}
              minSize={18}
              maxSize={35}
              className="bg-ice-surface ice-sidebar-shadow"
            >
              <ResourcePalette showProjectSection={showPalette} showBlocksSection={showBlocks} />
            </SidebarPanel>

            <ResizablePanel defaultSize={75}>
              <ResizablePanelGroup direction="vertical" className="h-full" autoSaveId="ice-layout-v">
                <ResizablePanel defaultSize={showRightPanel ? 55 : 100}>{canvasContent}</ResizablePanel>

                {isCanvasView && showAiChat && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={25} minSize={15} maxSize={50} className="bg-ice-surface">
                      <AiChatPanel />
                    </ResizablePanel>
                  </>
                )}

                {showProperties && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      defaultSize={showAiChat ? 20 : 40}
                      minSize={15}
                      maxSize={50}
                      className="bg-ice-surface"
                    >
                      <PropertiesPanel />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* Right collapsed strip */}
          <SidebarStrip side="right" tabs={rightStripTabs} />
        </div>
        <StatusBar />
      </div>
    );
  }

  // ── Landscape layout (default) ──────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-hidden flex">
        {/* Left collapsed strip */}
        <SidebarStrip side="left" tabs={leftStripTabs} />

        {/* Left sidebar with its own resize handle */}
        {showLeftPanel && (
          <DragResizePanel side="left" storageKey="ice-left-w" defaultWidth={260} minWidth={180} maxWidth={400}>
            <ResourcePalette showProjectSection={showPalette} showBlocksSection={showBlocks} />
          </DragResizePanel>
        )}

        {/* Center content — fills remaining space */}
        <div className="flex-1 min-w-0 h-full">{canvasContent}</div>

        {/* Right sidebar with its own resize handle */}
        {showRightPanel && (
          <DragResizePanel side="right" storageKey="ice-right-w" defaultWidth={320} minWidth={220} maxWidth={500}>
            {rightPanelContent}
          </DragResizePanel>
        )}

        {/* Right collapsed strip */}
        <SidebarStrip side="right" tabs={rightStripTabs} />
      </div>
      <StatusBar />
    </div>
  );
};
