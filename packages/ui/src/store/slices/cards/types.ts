/**
 * Cards slice — type definitions.
 *
 * Public types (`CardNode`, `CardEdge`, `CardViewport`, `Card`, `CardsState`)
 * are also re-exported from `../cards-slice` so external consumers keep
 * resolving the same import path during the rf-cards decomposition.
 *
 * `DEFAULT_VIEWPORT`, `CardSnapshot`, and `CardHistory` are marked
 * `@internal` — they exist here so sibling rf-cards-* modules
 * (persistence, snapshot, lifecycle reducer) can import them, but they
 * are NOT part of the slice's public API.
 */

export interface CardNode {
  id: string;
  type: 'block' | 'resource' | 'container';
  position: { x: number; y: number };
  width: number;
  height: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface CardEdge {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; [key: string]: unknown };
}

export interface CardViewport {
  panX: number;
  panY: number;
  scale: number;
}

export interface Card {
  id: string;
  name: string;
  nodes: CardNode[];
  edges: CardEdge[];
  viewport: CardViewport;
  createdAt: number;
  projectId?: string;
  environmentId?: string;
}

/**
 * @internal Slice-internal default viewport. Spread when constructing a
 * fresh `Card` so each card starts at pan (0,0) / scale 1.
 */
export const DEFAULT_VIEWPORT: CardViewport = {
  panX: 0,
  panY: 0,
  scale: 1,
};

/**
 * @internal Snapshot of a card's nodes + edges for undo/redo.
 */
export interface CardSnapshot {
  nodes: CardNode[];
  edges: CardEdge[];
}

/**
 * @internal Per-card undo/redo history.
 */
export interface CardHistory {
  past: CardSnapshot[];
  future: CardSnapshot[];
}

export interface CardsState {
  cards: Card[];
  activeCardId: string | null;
  /** Per-card undo/redo stacks keyed by card ID */
  history: Record<string, CardHistory>;
}
