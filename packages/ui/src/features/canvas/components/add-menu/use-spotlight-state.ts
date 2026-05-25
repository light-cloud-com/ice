/**
 * useSpotlightShortcut
 *
 * Window-level Shift+A listener that opens the canvas add-menu spotlight
 * at the current cursor position (converted to canvas-space). Ignored
 * while an input/textarea is focused so users can type freely inside
 * the properties panel.
 *
 * The hook also tracks `lastMouseClient` so when Shift+A fires we know
 * where to anchor the spawn. Keeping the listener here instead of in
 * the heavier `use-keyboard-handlers.ts` avoids touching that hook's
 * `[]`-dep useEffect, which would re-install all keyboard listeners on
 * every dep change.
 */

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { openSpotlight } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';

interface UseSpotlightShortcutArgs {
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  /** Disable the shortcut while the canvas is locked or another modal owns the key. */
  enabled?: boolean;
}

export function useSpotlightShortcut(args: UseSpotlightShortcutArgs): void {
  const { screenToCanvas, enabled = true } = args;
  const dispatch = useDispatch<AppDispatch>();
  const lastClient = useRef<{ x: number; y: number }>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const screenToCanvasRef = useRef(screenToCanvas);
  screenToCanvasRef.current = screenToCanvas;

  useEffect(() => {
    if (!enabled) return undefined;
    const onMove = (e: MouseEvent): void => {
      lastClient.current = { x: e.clientX, y: e.clientY };
    };
    const onKey = (e: KeyboardEvent): void => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;
      if (e.key.toLowerCase() === 'a' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const canvasPos = screenToCanvasRef.current(lastClient.current.x, lastClient.current.y);
        dispatch(openSpotlight({ canvasX: canvasPos.x, canvasY: canvasPos.y }));
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [dispatch, enabled]);
}
