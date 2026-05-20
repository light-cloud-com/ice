/**
 * Undo/Redo Keyboard Shortcuts
 *
 * Handles Ctrl+Z (undo) and Ctrl+Shift+Z / Ctrl+Y (redo)
 * for canvas node/edge changes.
 */

import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { undoCardChange, redoCardChange } from '../../store/slices/cards-slice';
import type { AppDispatch } from '../../store';

export function useUndoRedo() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch(undoCardChange());
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        dispatch(redoCardChange());
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);
}
