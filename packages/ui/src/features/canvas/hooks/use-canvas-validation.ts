/**
 * useCanvasValidation Hook
 *
 * Runs the validation engine on a debounced timer whenever
 * canvas nodes or edges change. Dispatches results to Redux.
 */

import { validateCanvas } from '@ice/core/validation';
import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import { setValidationResult, setValidating, clearValidation } from '../../../store/slices/validation-slice';
import type { RootState } from '../../../store';
import type { ValidatableNode, ValidatableEdge } from '@ice/core/validation';

const VALIDATION_DEBOUNCE_MS = 500;

/**
 * Hook that auto-validates the active canvas card.
 * Call once in the SvgCanvas component.
 */
export function useCanvasValidation() {
  const dispatch = useDispatch();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get current active card's nodes and edges
  const activeCard = useSelector(selectActiveCard);
  const nodes = activeCard?.nodes;
  const edges = activeCard?.edges;

  // Get provider context for validation
  const provider = useSelector((state: RootState) => {
    // Try to get from integrations or environments
    const envs = state.environments;
    return (envs as any)?.activeProvider ?? undefined;
  });

  useEffect(() => {
    // Clear validation when no active card
    if (!nodes || !edges) {
      dispatch(clearValidation());
      return;
    }

    // Debounce validation
    if (timerRef.current) clearTimeout(timerRef.current);

    dispatch(setValidating(true));

    timerRef.current = setTimeout(() => {
      // Map CardNode/CardEdge to ValidatableNode/ValidatableEdge
      const validatableNodes: ValidatableNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        parentId: n.parentId,
      }));

      const validatableEdges: ValidatableEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        data: e.data,
      }));

      const result = validateCanvas(validatableNodes, validatableEdges, {
        mode: 'design',
        provider,
      });

      const payload = {
        issues: [...result.issues],
        valid: result.valid,
        deployable: result.deployable,
        summary: result.summary,
        validatedAt: result.validatedAt,
      };
      dispatch(setValidationResult(payload));

      // Mirror to window for tests (gated by the same localStorage flag the
      // action log uses). Off in production browser sessions.
      try {
        if (typeof window !== 'undefined' && window.localStorage?.getItem('ice-action-log') === 'true') {
          (window as unknown as { __ICE_VALIDATION__?: typeof payload }).__ICE_VALIDATION__ = payload;
        }
      } catch {
        /* no-op */
      }
    }, VALIDATION_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodes, edges, provider, dispatch]);
}
