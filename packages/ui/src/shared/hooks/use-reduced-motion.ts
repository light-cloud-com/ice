import { useState, useEffect } from 'react';

/**
 * One-shot, non-reactive read of the reduced-motion preference. For call sites
 * that can't take the hook cleanly — e.g. gating an SVG SMIL `<animate>` (which
 * `@media (prefers-reduced-motion)` in CSS does NOT cover) from a render-pure
 * presentational component. Does not update if the OS setting changes mid-life;
 * use {@link useReducedMotion} where live reactivity matters.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    ? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    : false;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) : false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
