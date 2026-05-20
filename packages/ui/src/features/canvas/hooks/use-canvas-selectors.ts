/**
 * useCanvasSelectors
 *
 * Bundles every `useSelector` the orchestrator (`svg-canvas.tsx`) reads
 * before threading inputs into the data/handler/effect sub-hooks. Eleven
 * cross-slice selectors plus one derived `card` lookup that picks
 * between an explicit `cardId` prop and the active-card selector.
 *
 * Each call is a thin wrapper over a `state.<slice>.<field>` accessor.
 * Bundled here so the orchestrator outline stays compact and downstream
 * consumers can mock a single hook surface in tests rather than each
 * useSelector individually.
 *
 * rf-canv2-7.
 */

import { useSelector } from 'react-redux';
import { selectActiveCard } from '../../../store/slices/cards-slice';
import type { RootState } from '../../../store';
import type { Card } from '../../../store/slices/cards-slice';

export interface UseCanvasSelectorsArgs {
  /** Optional card id; falls back to the active card when omitted. */
  cardId?: string;
}

export interface UseCanvasSelectorsResult {
  /** The resolved card — explicit `cardId` first, then active card. */
  card: Card | undefined;
  /** Always-present active card (for the deploy-banner cardId thread). */
  activeCard: Card | undefined;
  selectedNodes: string[];
  selectedEdges: string[];
  viewLevel: RootState['view']['viewLevel'];
  animatingNodes: RootState['ai']['animatingNodes'];
  animatingEdges: RootState['ai']['animatingEdges'];
  aiCurrentIntent: RootState['ai']['currentIntent'];
  pipelineNodeStatus: RootState['pipeline']['nodeStatus'];
  edgeStyle: RootState['ui']['edgeStyle'];
  validationIssues: RootState['validation']['issues'];
  snapToGrid: boolean;
  canvasLocked: boolean;
}

export function useCanvasSelectors(args: UseCanvasSelectorsArgs): UseCanvasSelectorsResult {
  const { cardId } = args;

  const activeCard = useSelector(selectActiveCard);
  const allCards = useSelector((state: RootState) => state.cards.cards);
  const card = cardId ? allCards.find((c) => c.id === cardId) : activeCard;

  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const selectedEdges = useSelector((state: RootState) => state.selection.selectedEdges);
  const viewLevel = useSelector((state: RootState) => state.view.viewLevel);
  const animatingNodes = useSelector((state: RootState) => state.ai.animatingNodes);
  const animatingEdges = useSelector((state: RootState) => state.ai.animatingEdges);
  const aiCurrentIntent = useSelector((state: RootState) => state.ai.currentIntent);
  const pipelineNodeStatus = useSelector((state: RootState) => state.pipeline.nodeStatus);
  const edgeStyle = useSelector((state: RootState) => state.ui.edgeStyle);
  const validationIssues = useSelector((state: RootState) => state.validation.issues);
  const snapToGrid = useSelector((state: RootState) => state.ui.snapToGrid);
  const canvasLocked = useSelector((state: RootState) => state.ui.canvasLocked);

  return {
    card,
    activeCard,
    selectedNodes,
    selectedEdges,
    viewLevel,
    animatingNodes,
    animatingEdges,
    aiCurrentIntent,
    pipelineNodeStatus,
    edgeStyle,
    validationIssues,
    snapToGrid,
    canvasLocked,
  };
}
