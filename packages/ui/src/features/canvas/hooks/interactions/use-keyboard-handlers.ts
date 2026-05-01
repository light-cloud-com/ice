/**
 * rf-canvint-4: Keyboard-handler sub-hook for the canvas-interactions
 * group.
 *
 * Owns the keyboard `useEffect` that installs window-level
 * `keydown`/`keyup`/`blur` listeners, plus the requestAnimationFrame-
 * driven keyboard-pan loop.
 *
 * The orchestrator owns:
 *  - `viewportRef`, `lockedRef`, `spaceHeldRef` (cross-hook refs).
 *  - The latest-callback refs that the effect's `[]`-dep listener
 *    closes over (`onViewportChange`, `onDelete`, `onSelect`,
 *    `onSelectAll`).
 *
 * The hook OWNS:
 *  - `pressedKeysRef`, `animationFrameRef`, `isAnimatingRef`. These
 *    are private — the orchestrator never reads or writes them, so
 *    they live here.
 *
 * Discovered: rf-pdpl-21
 * `fingerprint-multi-useEffect-by-deps-array-shape-when-bundled-in-one-hook`
 * — the effect has a `[]` deps array (one-shot install on mount) and
 * captures every callback through a ref (so a callback identity
 * change does NOT re-install listeners). That's intentional: the
 * keyboard listener is global to `window`, not scoped to the SVG
 * element, and re-installing on every render would race with concurrent
 * input. The latest-ref pattern keeps callbacks fresh without
 * re-installing.
 */

import { useEffect, useRef, type MutableRefObject } from 'react';
import { KEYBOARD_PAN_SPEED } from './state.js';
import type { CanvasViewport, UseCanvasInteractionsOptions } from './types.js';

interface UseKeyboardHandlersDeps {
  // Refs owned by the orchestrator — read by the keyboard handlers.
  viewportRef: MutableRefObject<CanvasViewport>;
  lockedRef: MutableRefObject<boolean>;
  // Written by the keyboard sub-hook (Space key tracking) AND read by
  // the mouse sub-hook (Space+left-click pan). Owning at the orchestrator
  // makes the cross-hook coupling explicit.
  spaceHeldRef: MutableRefObject<boolean>;

  // Latest-callback refs — kept fresh by the orchestrator so the
  // `[]`-dep useEffect always invokes the freshest callback without
  // re-installing the window listeners.
  onViewportChangeRef: MutableRefObject<UseCanvasInteractionsOptions['onViewportChange']>;
  onDeleteRef: MutableRefObject<UseCanvasInteractionsOptions['onDelete']>;
  onSelectRef: MutableRefObject<UseCanvasInteractionsOptions['onSelect']>;
  onSelectAllRef: MutableRefObject<(() => void) | undefined>;
}

export function useKeyboardHandlers(deps: UseKeyboardHandlersDeps): void {
  const { viewportRef, lockedRef, spaceHeldRef, onViewportChangeRef, onDeleteRef, onSelectRef, onSelectAllRef } =
    deps;

  // Hook-private refs.
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const updateKeyboardPan = () => {
      if (!isAnimatingRef.current) return;

      const keys = pressedKeysRef.current;
      if (keys.size === 0) {
        isAnimatingRef.current = false;
        animationFrameRef.current = null;
        return;
      }

      const vp = viewportRef.current;
      let panDx = 0;
      let panDy = 0;

      if (keys.has('w') || keys.has('arrowup')) panDy += KEYBOARD_PAN_SPEED;
      if (keys.has('s') || keys.has('arrowdown')) panDy -= KEYBOARD_PAN_SPEED;
      if (keys.has('a') || keys.has('arrowleft')) panDx += KEYBOARD_PAN_SPEED;
      if (keys.has('d') || keys.has('arrowright')) panDx -= KEYBOARD_PAN_SPEED;

      if (panDx !== 0 || panDy !== 0) {
        onViewportChangeRef.current({ ...vp, x: vp.x + panDx, y: vp.y + panDy });
      }

      animationFrameRef.current = requestAnimationFrame(updateKeyboardPan);
    };

    const startKeyboardPan = () => {
      if (!isAnimatingRef.current && pressedKeysRef.current.size > 0) {
        isAnimatingRef.current = true;
        animationFrameRef.current = requestAnimationFrame(updateKeyboardPan);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const key = e.key.toLowerCase();

      // Track space for space+drag pan
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        spaceHeldRef.current = true;
      }

      const panKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

      if (panKeys.includes(key)) {
        e.preventDefault();
        pressedKeysRef.current.add(key);
        startKeyboardPan();
      }

      // Delete/Backspace (blocked when canvas locked)
      if ((key === 'delete' || key === 'backspace') && !lockedRef.current) {
        e.preventDefault();
        onDeleteRef.current?.();
      }

      // Escape — deselect all
      if (key === 'escape') {
        e.preventDefault();
        onSelectRef.current?.([]);
      }

      // Ctrl+A — select all
      if (key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSelectAllRef.current?.();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.key === ' ' || e.code === 'Space') spaceHeldRef.current = false;
      pressedKeysRef.current.delete(key);

      if (pressedKeysRef.current.size === 0) {
        isAnimatingRef.current = false;
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
      isAnimatingRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      isAnimatingRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    // Verbatim `[]` deps — see hook docblock for why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
