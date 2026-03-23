/**
 * Card Tabs Component
 *
 * Tab bar for switching between different canvas cards.
 * Supports creating, deleting, and renaming cards.
 */

import { Plus, X, Pencil, Check } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { cn } from '../../../shared/utils/cn';
import {
  setActiveCard,
  createCard,
  deleteCard,
  renameCard,
  selectCards,
  selectActiveCardId,
} from '../../../store/slices/cards-slice';
import type { AppDispatch } from '../../../store';

export const CardTabs: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const cards = useSelector(selectCards);
  const activeCardId = useSelector(selectActiveCardId);

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

  const handleTabClick = (cardId: string) => {
    if (editingId !== cardId) {
      dispatch(setActiveCard(cardId));
    }
  };

  const handleCreateCard = () => {
    dispatch(createCard());
  };

  const handleDeleteCard = (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    if (cards.length > 1) {
      dispatch(deleteCard(cardId));
    }
  };

  const handleStartRename = (e: React.MouseEvent, cardId: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(cardId);
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

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-ice-base border-b border-ice-border">
      {/* Card tabs */}
      {cards.map((card) => {
        const isActive = card.id === activeCardId;
        const isEditing = editingId === card.id;

        return (
          <div
            key={card.id}
            onClick={() => handleTabClick(card.id)}
            className={cn(
              'group relative flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all',
              'text-sm font-medium',
              isActive
                ? 'bg-[#1f2937] text-ice-text-1 border border-ice-accent'
                : 'bg-ice-surface text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1 border border-transparent',
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
                className="w-24 bg-ice-base text-ice-text-1 text-sm px-1 py-0.5 rounded border border-ice-accent outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate max-w-[120px]">{card.name}</span>
            )}


            {/* Action buttons - shown on hover or when active */}
            {!isEditing && (
              <div
                className={cn(
                  'flex items-center gap-0.5 ml-1',
                  isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  'transition-opacity',
                )}
              >
                {/* Rename button */}
                <button
                  onClick={(e) => handleStartRename(e, card.id, card.name)}
                  className="p-0.5 rounded hover:bg-ice-hover text-ice-text-2 hover:text-ice-text-1 transition-colors"
                  title="Rename card"
                >
                  <Pencil className="w-3 h-3" />
                </button>

                {/* Delete button - only if more than one card */}
                {cards.length > 1 && (
                  <button
                    onClick={(e) => handleDeleteCard(e, card.id)}
                    className="p-0.5 rounded hover:bg-[#da3633]/20 text-ice-text-2 hover:text-[#f85149] transition-colors"
                    title="Delete card"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
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

      {/* Add new card button */}
      <button
        onClick={handleCreateCard}
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-md',
          'bg-ice-surface text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1',
          'border border-transparent hover:border-ice-border',
          'transition-all',
        )}
        title="Create new card"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

export default CardTabs;
