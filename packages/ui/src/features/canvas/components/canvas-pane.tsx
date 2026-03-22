/**
 * Canvas Pane Component
 *
 * Individual pane in the split view, containing tab bar and SvgCanvas.
 * Each pane shows only its own openCardIds as simple tabs.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Plus, X, Pencil, Check, FolderOpen, Rocket } from 'lucide-react';
import type { AppDispatch } from '../../../store';
import { setActiveCard, renameCard, selectCards } from '../../../store/slices/cards-slice';
import {
  setPaneCard,
  setActivePane,
  closeSplit,
  closeTabInPane,
  openDialog,
} from '../../../store/slices/ui-slice';
import { selectProjects } from '../../../store/slices/projects-slice';
import type { RootState } from '../../../store';
import { SvgCanvas } from './svg-canvas';
import { cn } from '../../../shared/utils/cn';

interface CanvasPaneProps {
  paneId: string;
  cardId: string;
  isActive: boolean;
  showCloseButton: boolean;
}

export const CanvasPane: React.FC<CanvasPaneProps> = ({
  paneId,
  cardId,
  isActive,
  showCloseButton,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const allCards = useSelector(selectCards);
  const pane = useSelector((state: RootState) =>
    state.ui.splitView.panes.find((p) => p.id === paneId)
  );
  const projects = useSelector(selectProjects);

  // Only cards open in THIS pane
  const openCardIds = pane?.openCardIds || [cardId];
  const tabs = allCards.filter((c) => openCardIds.includes(c.id));

  // All environments across all projects (for env-type dot lookup)
  const allEnvironments = projects.flatMap((p) => p.environments);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleTabClick = (clickedCardId: string) => {
    if (editingId !== clickedCardId) {
      dispatch(setPaneCard({ paneId, cardId: clickedCardId }));
      dispatch(setActivePane(paneId));
      dispatch(setActiveCard(clickedCardId));
    }
  };

  const handleCreateProject = () => {
    dispatch(openDialog('projectWizard'));
  };

  const handleCloseTab = (e: React.MouseEvent, cardIdToClose: string) => {
    e.stopPropagation();
    dispatch(closeTabInPane({ paneId, cardId: cardIdToClose }));
  };

  const handleStartRename = (e: React.MouseEvent, cardIdToRename: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(cardIdToRename);
    setEditingName(currentName);
  };

  const handleFinishRename = () => {
    if (editingId && editingName.trim()) {
      dispatch(renameCard({ cardId: editingId, name: editingName.trim() }));
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  const handlePaneFocus = () => {
    dispatch(setActivePane(paneId));
    dispatch(setActiveCard(cardId));
  };

  const handleClosePane = () => {
    dispatch(closeSplit());
  };

  return (
    <div className={cn('h-full flex flex-col', isActive && 'ring-2 ring-blue-500/50 ring-inset')}>
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-ice-base border-b border-ice-border">
        {/* Tabs — one per open card in this pane */}
        {tabs.map((card) => {
          const isActiveTab = card.id === cardId;
          const isEditing = editingId === card.id;
          const env = allEnvironments.find((e) => e.cardId === card.id);

          return (
            <div
              key={card.id}
              onClick={() => handleTabClick(card.id)}
              className={cn(
                'group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-all',
                'text-xs font-medium',
                isActiveTab && isActive
                  ? 'bg-[#1f2937] text-ice-text-1 border border-ice-accent'
                  : isActiveTab
                    ? 'bg-[#1f2937] text-ice-text-2 border border-ice-border'
                    : 'bg-ice-surface text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1 border border-transparent'
              )}
            >
              {/* Tab name or input */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={handleKeyDown}
                  className="w-24 bg-ice-base text-ice-text-1 text-xs px-1 py-0.5 rounded border border-ice-accent outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate max-w-[120px]">{card.name}</span>
              )}

              {/* Env type indicator dot */}
              {env && !isEditing && (
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    env.type === 'production' && 'bg-green-500',
                    env.type === 'staging' && 'bg-yellow-500',
                    env.type === 'development' && 'bg-blue-500',
                    env.type === 'pr' && 'bg-purple-500'
                  )}
                />
              )}

              {/* Demo badge */}
              {card.isDemo && !isEditing && (
                <span className="text-ice-xs px-1.5 py-0.5 rounded bg-ice-green/20 text-ice-green font-medium">
                  DEMO
                </span>
              )}

              {/* Action buttons */}
              {!isEditing && (
                <div
                  className={cn(
                    'flex items-center gap-0.5 ml-1',
                    isActiveTab ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    'transition-opacity'
                  )}
                >
                  <button
                    onClick={(e) => handleStartRename(e, card.id, card.name)}
                    className="p-0.5 rounded hover:bg-ice-hover text-ice-text-2 hover:text-ice-text-1 transition-colors"
                    title="Rename card"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>

                  <button
                    onClick={(e) => handleCloseTab(e, card.id)}
                    className="p-0.5 rounded hover:bg-[#da3633]/20 text-ice-text-2 hover:text-[#f85149] transition-colors"
                    title="Close tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Finish editing button */}
              {isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFinishRename();
                  }}
                  className="p-0.5 rounded hover:bg-ice-green/20 text-ice-green transition-colors"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add button — opens project wizard */}
        <button
          onClick={handleCreateProject}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md',
            'bg-ice-surface text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1',
            'border border-transparent hover:border-ice-border',
            'transition-all'
          )}
          title="New Project"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Close split button */}
        {showCloseButton && (
          <button
            onClick={handleClosePane}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-md',
              'bg-ice-surface text-ice-text-2 hover:bg-[#da3633]/20 hover:text-[#f85149]',
              'border border-transparent hover:border-[#da3633]/30',
              'transition-all'
            )}
            title="Close split"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Canvas or empty landing */}
      <div className="flex-1 overflow-hidden">
        {tabs.length > 0 && cardId ? (
          <SvgCanvas cardId={cardId} paneId={paneId} onFocus={handlePaneFocus} />
        ) : (
          <div className="h-full flex items-center justify-center bg-ice-base">
            <div className="text-center space-y-6">
              <div className="text-ice-text-2 text-sm">No open tabs</div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreateProject}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                    'bg-ice-green hover:bg-[#2ea043] text-white text-sm font-medium',
                    'transition-colors'
                  )}
                >
                  <Rocket className="w-4 h-4" />
                  Create Project
                </button>
                {allCards.length > 0 && (
                  <button
                    onClick={() => {
                      // Open the first available card
                      const firstCard = allCards[0];
                      if (firstCard) {
                        dispatch(setPaneCard({ paneId, cardId: firstCard.id }));
                        dispatch(setActiveCard(firstCard.id));
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                      'bg-ice-raised hover:bg-ice-hover text-ice-text-1 text-sm font-medium',
                      'border border-ice-border hover:border-ice-border-strong',
                      'transition-colors'
                    )}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Open Existing
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasPane;
