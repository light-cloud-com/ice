/**
 * Main Layout — sidebar + center content + properties
 *
 * Center content switches between Canvas and Table view.
 * Properties panel goes to the right on landscape, bottom on portrait.
 * AI chat sits below the canvas, full width, expand/collapse in place.
 */

import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';
import { ResourcePalette } from '../features/palette/components/resource-palette';
import { PropertiesPanel } from '../features/properties/components/properties-panel';
import { AiChatPanel, AiChatCollapsedBar } from '../features/ai/components/ai-chat-panel';
import { SvgCanvas } from '../features/canvas/components/svg-canvas';
import { StatusBar } from './status-bar';
import { InlineTableView } from './inline-table-view';
import { createCard, importToActiveCard, setActiveCard } from '../store/slices/cards-slice';
import axiosInstance from '../api/axios-instance';
import type { RootState, AppDispatch } from '../store';

interface MainLayoutProps {
  projectId?: string;
  projectName?: string;
  view?: 'canvas' | 'table';
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

export const MainLayout: React.FC<MainLayoutProps> = ({ projectId, projectName, view = 'canvas', children }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { showPalette, showProperties, showAiChat } = useSelector((state: RootState) => state.ui);
  const isPortrait = useIsPortrait();
  const isCanvasView = view === 'canvas' && !children;

  const loadedProjectRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    // Guard against double-invocation (React StrictMode / re-renders)
    if (loadedProjectRef.current === projectId) return;
    loadedProjectRef.current = projectId;

    const loadProject = async () => {
      try {
        const res = await axiosInstance.post('/canvas/projects/get', { projectId });
        const project = res.data;
        const environments = project.environments || [];
        const cards = project.cards || [];

        // If project has environments, the EnvironmentTabBar handles card loading.
        // We only need to load the production env's card as default.
        if (environments.length > 0) {
          const prodEnv = environments.find((e: any) => e.type === 'production');
          const cardId = prodEnv?.card_id || cards[0]?.id;
          if (cardId) {
            await loadCard(cardId, projectId);
          }
          return;
        }

        // Legacy: no environments — load first card directly
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

  // Canvas content (without AI — AI is now a sibling panel)
  const canvasContent = (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        {children ? children : view === 'table' ? <InlineTableView /> : <SvgCanvas />}
      </div>
      {/* Collapsed AI bar when chat is hidden */}
      {isCanvasView && !showAiChat && <AiChatCollapsedBar />}
    </div>
  );

  // Portrait: properties + AI at bottom
  if (isPortrait) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="ice-layout-h-v2">
            {/* Left — Sidebar */}
            <ResizablePanel
              defaultSize={showPalette ? 25 : 0}
              minSize={showPalette ? 18 : 0}
              maxSize={showPalette ? 35 : 0}
              collapsible
              collapsedSize={0}
              className="bg-ice-surface ice-sidebar-shadow"
              style={{ overflow: showPalette ? undefined : 'hidden' }}
            >
              {showPalette && <ResourcePalette />}
            </ResizablePanel>
            <ResizableHandle withHandle style={{ display: showPalette ? undefined : 'none' }} />

            {/* Center + Bottom panels */}
            <ResizablePanel defaultSize={75}>
              <ResizablePanelGroup direction="vertical" className="h-full" autoSaveId="ice-layout-v">
                <ResizablePanel defaultSize={showProperties || showAiChat ? 55 : 100}>{canvasContent}</ResizablePanel>

                {/* AI Chat — bottom panel (portrait) */}
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
        </div>
        <StatusBar />
      </div>
    );
  }

  // Landscape: properties + AI on right (default)
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="ice-layout-v2">
          {/* Left — Sidebar */}
          <ResizablePanel
            defaultSize={showPalette ? 20 : 0}
            minSize={showPalette ? 15 : 0}
            maxSize={showPalette ? 30 : 0}
            collapsible
            collapsedSize={0}
            className="bg-ice-surface ice-sidebar-shadow"
            style={{ overflow: showPalette ? undefined : 'hidden' }}
          >
            {showPalette && <ResourcePalette />}
          </ResizablePanel>
          <ResizableHandle withHandle style={{ display: showPalette ? undefined : 'none' }} />

          {/* Center */}
          <ResizablePanel defaultSize={showProperties || showAiChat ? 55 : 80}>{canvasContent}</ResizablePanel>

          {/* Right side panels — AI + Properties stacked vertically */}
          {(showProperties || (isCanvasView && showAiChat)) && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={18} maxSize={45} className="bg-ice-surface">
                {showProperties && isCanvasView && showAiChat ? (
                  // Both AI and Properties visible — stack vertically
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
                )}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <StatusBar />
    </div>
  );
};
