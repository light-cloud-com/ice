/** Canvas API contracts */

export interface CanvasProject {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  type: 'folder' | 'project';
  parent_id?: string | null;
  organisation_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  cards?: CanvasCardSummary[];
}

export interface CanvasCardSummary {
  id: string;
  name: string;
  updated_at: string;
}

export interface CanvasCard {
  id: string;
  name: string;
  project_id: string;
  nodes: CardNode[];
  edges: CardEdge[];
  viewport?: CardViewport;
  created_at: string;
  updated_at: string;
}

export interface CardNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentId?: string;
}

export interface CardEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

export interface CardViewport {
  x: number;
  y: number;
  zoom: number;
}
