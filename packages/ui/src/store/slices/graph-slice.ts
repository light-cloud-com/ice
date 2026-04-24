/**
 * Graph State Slice
 *
 * Manages the infrastructure graph state including:
 * - ICE graph (source of truth)
 * - Graph load/save/initialize via IPC
 * - Undo/redo history
 * - ICE-to-canvas transform (iceToCanvas)
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  type ViewLevel,
  type EmptyContainerMode,
  VIEW_LEVELS,
  isTypeVisibleAtLevel,
} from '../../config/visualization-config';
import { getApi } from '../../shared/api/api-adapter';

// Types - Canvas Node/Edge (used by SVG Canvas)
export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  zIndex?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

// ICE Graph types (source of truth)
interface IceNode {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  behavior?: string;
  metadata: {
    created_at: string;
    updated_at: string;
    labels: Record<string, string>;
  };
}

interface IceEdge {
  id: string;
  source: string;
  target: string;
  relationship: 'depends_on' | 'contains' | 'references' | 'connects_to';
  metadata: {
    created_at: string;
    labels: Record<string, string>;
  };
}

interface SerializedGraph {
  id: string;
  name: string;
  version: string;
  nodes: IceNode[];
  edges: IceEdge[];
  metadata: Record<string, unknown>;
}

export interface GraphState {
  iceGraph: SerializedGraph | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  isLoading: boolean;
  error: string | null;
  isDirty: boolean;
  filePath: string | null;
  history: {
    past: SerializedGraph[];
    future: SerializedGraph[];
  };
}

// Convert demo data to Redux node format

const initialState: GraphState = {
  iceGraph: null,
  nodes: [],
  edges: [],
  isLoading: false,
  error: null,
  isDirty: false,
  filePath: null,
  history: { past: [], future: [] },
};

// Async thunks
export const initializeGraph = createAsyncThunk('graph/initialize', async () => {
  // Just reset local state — project/card creation is handled by MainLayout
  return null;
});

export const loadGraph = createAsyncThunk('graph/load', async (filePath: string) => {
  const api = getApi();
  const graph = await api.graph.load(filePath);
  return { graph, filePath };
});

export const saveGraph = createAsyncThunk('graph/save', async (filePath?: string) => {
  const api = getApi();
  return await api.graph.save(filePath);
});

// =============================================================================
// Transform Options
// =============================================================================

interface TransformOptions {
  viewLevel: ViewLevel;
  emptyContainerMode: EmptyContainerMode;
}

const DEFAULT_OPTIONS: TransformOptions = {
  viewLevel: 2,
  emptyContainerMode: 'hide',
};

// =============================================================================
// ICE to Canvas Transform
// =============================================================================

function iceToCanvas(
  graph: SerializedGraph,
  options: TransformOptions = DEFAULT_OPTIONS,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const { viewLevel, emptyContainerMode } = options;
  const viewConfig = VIEW_LEVELS[viewLevel];

  // Build relationship maps
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();

  graph.edges.forEach((edge) => {
    if (edge.relationship === 'contains') {
      parentMap.set(edge.target, edge.source);
      const children = childrenMap.get(edge.source) || [];
      children.push(edge.target);
      childrenMap.set(edge.source, children);
    }
  });

  // First pass: determine visibility
  const visibleNodeIds = new Set<string>();
  graph.nodes.forEach((node) => {
    if (isTypeVisibleAtLevel(node.type, viewLevel)) {
      visibleNodeIds.add(node.id);
    }
  });

  // Calculate visible children per container
  const visibleChildrenMap = new Map<string, string[]>();
  graph.nodes.forEach((node) => {
    if (node.behavior === 'container') {
      const allChildren = childrenMap.get(node.id) || [];
      const visibleChildren = allChildren.filter((id) => visibleNodeIds.has(id));
      visibleChildrenMap.set(node.id, visibleChildren);
    }
  });

  // Handle empty containers
  if (emptyContainerMode === 'hide') {
    graph.nodes.forEach((node) => {
      if (node.behavior === 'container') {
        const visibleChildren = visibleChildrenMap.get(node.id) || [];
        if (visibleChildren.length === 0 && !viewConfig.showEmptyContainers) {
          visibleNodeIds.delete(node.id);
        }
      }
    });
  }

  // Calculate depths
  const depthMap = new Map<string, number>();
  function getDepth(nodeId: string): number {
    if (depthMap.has(nodeId)) return depthMap.get(nodeId)!;
    const parentId = parentMap.get(nodeId);
    const depth = parentId ? getDepth(parentId) + 1 : 0;
    depthMap.set(nodeId, depth);
    return depth;
  }
  graph.nodes.forEach((node) => getDepth(node.id));

  // Sort: parents before children
  const sortedNodes = [...graph.nodes].sort((a, b) => {
    const depthA = depthMap.get(a.id) || 0;
    const depthB = depthMap.get(b.id) || 0;
    if (depthA !== depthB) return depthA - depthB;
    if (a.behavior === 'container' && b.behavior !== 'container') return -1;
    if (a.behavior !== 'container' && b.behavior === 'container') return 1;
    return 0;
  });

  // Track visible child indices for positioning
  const visibleChildIndices = new Map<string, number>();

  // Transform nodes
  const canvasNodes: CanvasNode[] = [];

  sortedNodes.forEach((node) => {
    if (!visibleNodeIds.has(node.id)) return;

    const parentId = parentMap.get(node.id);
    if (parentId && !visibleNodeIds.has(parentId)) return;

    const isContainer = node.behavior === 'container';
    const visibleChildren = visibleChildrenMap.get(node.id) || [];
    const visibleChildCount = visibleChildren.length;
    const depth = depthMap.get(node.id) || 0;

    // Unified node sizing: 280x160 for all nodes
    // Auto-organize will resize containers to fit children
    const width = node.size?.width || 280;
    const height = node.size?.height || 160;

    // Calculate position
    let position: { x: number; y: number };

    if (parentId && visibleNodeIds.has(parentId)) {
      // Position within parent - simple grid layout
      const currentIndex = visibleChildIndices.get(parentId) || 0;
      visibleChildIndices.set(parentId, currentIndex + 1);

      // Simple 2-column layout inside containers
      const col = currentIndex % 2;
      const row = Math.floor(currentIndex / 2);
      const gap = 30;
      const padding = 50;
      position = {
        x: padding + col * (280 + gap),
        y: padding + row * (160 + gap),
      };
    } else if (node.position) {
      // Use saved position
      position = node.position;
    } else {
      // Root node - position in grid with 80px gap
      const rootNodes = canvasNodes.filter((n) => !n.parentId);
      const rootIndex = rootNodes.length;
      const gap = 80;
      const col = rootIndex % 3;
      const row = Math.floor(rootIndex / 3);
      position = {
        x: 50 + col * (280 + gap),
        y: 50 + row * (160 + gap),
      };
    }

    // Z-index: containers below, resources above
    const zIndex = isContainer ? depth * 10 : 100 + depth * 10;

    // Determine canvas node type based on iceType prefix
    let canvasType: string;
    if (node.type.startsWith('Group.')) {
      canvasType = 'container';
    } else if (isContainer && node.type !== 'Network.VPC' && node.type !== 'Network.Subnet') {
      canvasType = 'container';
    } else {
      canvasType = 'resource';
    }

    canvasNodes.push({
      id: node.id,
      type: canvasType,
      position,
      zIndex,
      width,
      height,
      data: {
        label: node.name,
        iceType: node.type,
        category: node.type.split('.')[0],
        behavior: node.behavior || 'singleton',
        properties: node.properties,
        isValid: true,
        validationErrors: [],
        childCount: (childrenMap.get(node.id) || []).length,
        visibleChildCount,
        isEmpty: isContainer && visibleChildCount === 0,
        folded: false,
      },
      ...(parentId &&
        visibleNodeIds.has(parentId) && {
          parentId,
          extent: 'parent' as const,
          expandParent: true,
        }),
    });
  });

  // Transform edges
  const edges: CanvasEdge[] = graph.edges
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: { relationship: edge.relationship },
    }));

  return { nodes: canvasNodes, edges };
}

// =============================================================================
// Slice
// =============================================================================

const graphSlice = createSlice({
  name: 'graph',
  initialState,
  reducers: {
    undo: (state) => {
      if (state.history.past.length > 0) {
        const previous = state.history.past.pop()!;
        if (state.iceGraph) state.history.future.unshift(state.iceGraph);
        state.iceGraph = previous;
        const { nodes, edges } = iceToCanvas(previous);
        state.nodes = nodes;
        state.edges = edges;
      }
    },
    redo: (state) => {
      if (state.history.future.length > 0) {
        const next = state.history.future.shift()!;
        if (state.iceGraph) state.history.past.push(state.iceGraph);
        state.iceGraph = next;
        const { nodes, edges } = iceToCanvas(next);
        state.nodes = nodes;
        state.edges = edges;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeGraph.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initializeGraph.fulfilled, (state, action) => {
        state.isLoading = false;
        state.iceGraph = action.payload;
        state.nodes = [];
        state.edges = [];
        state.isDirty = false;
        state.filePath = null;
        state.history = { past: [], future: [] };
      })
      .addCase(initializeGraph.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to initialize';
      })
      .addCase(loadGraph.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadGraph.fulfilled, (state, action) => {
        state.isLoading = false;
        state.iceGraph = action.payload.graph;
        state.filePath = action.payload.filePath;
        state.isDirty = false;
        state.history = { past: [], future: [] };
        const { nodes, edges } = iceToCanvas(action.payload.graph);
        state.nodes = nodes;
        state.edges = edges;
      })
      .addCase(loadGraph.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load';
      })
      .addCase(saveGraph.fulfilled, (state, action) => {
        state.isDirty = false;
        state.filePath = action.payload.path;
      });
  },
});

export const { undo, redo } = graphSlice.actions;
export default graphSlice.reducer;
