/**
 * tour-11 — Keyboard shortcuts for the running tour.
 *
 * Capture-phase listener: Esc (skip), ArrowRight/Enter (advance),
 * ArrowLeft (previous). Suppresses advance/previous when the user is
 * typing — INPUT/TEXTAREA/SELECT for Enter; same plus
 * `isContentEditable` for arrow keys. Calls `preventDefault()` on
 * consumed keys so default scroll-on-arrow doesn't fight the tour's
 * own scrollIntoView. Full spec in blueprint §3.4 + §6/tour-11.
 *
 * The handler reads callbacks through a ref so the effect re-binds
 * only when `active` flips, not on every parent re-render.
 */
import { useEffect, useRef } from 'react';

export interface UseTourKeyboardOptions {
  active: boolean;
  onAdvance: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

interface CallbackRef {
  onAdvance: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

const EDITABLE_TAGS: readonly string[] = ['INPUT', 'TEXTAREA', 'SELECT'];

function isEditableActive(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as (Element & { isContentEditable?: boolean }) | null;
  if (!el) return false;
  if (EDITABLE_TAGS.includes(el.tagName)) return true;
  // contentEditable surfaces (rich-text editors).
  return Boolean(el.isContentEditable);
}

function isFormFieldActive(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as Element | null;
  if (!el) return false;
  return EDITABLE_TAGS.includes(el.tagName);
}

export function useTourKeyboard(opts: UseTourKeyboardOptions): void {
  const { active, onAdvance, onPrevious, onSkip } = opts;
  const callbacksRef = useRef<CallbackRef>({ onAdvance, onPrevious, onSkip });
  callbacksRef.current = { onAdvance, onPrevious, onSkip };

  useEffect(() => {
    if (!active) return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event: KeyboardEvent): void => {
      const cb = callbacksRef.current;

      if (event.key === 'Escape') {
        event.preventDefault();
        cb.onSkip();
        return;
      }

      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        // Don't steal Enter / Space when the user is typing in a form field.
        // ('Spacebar' is the legacy IE/Edge name; modern browsers use ' '.)
        if (isFormFieldActive()) return;
        event.preventDefault();
        cb.onAdvance();
        return;
      }

      if (event.key === 'ArrowRight') {
        if (isEditableActive()) return;
        event.preventDefault();
        cb.onAdvance();
        return;
      }

      if (event.key === 'ArrowLeft') {
        if (isEditableActive()) return;
        event.preventDefault();
        cb.onPrevious();
        return;
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }, [active]);
}
