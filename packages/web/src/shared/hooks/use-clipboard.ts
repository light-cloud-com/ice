/**
 * Clipboard Hook
 *
 * Handles Ctrl+C, Ctrl+V, Ctrl+X for canvas nodes.
 * Serializes selected nodes + edges to clipboard as JSON.
 * On paste, generates new IDs and offsets positions.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import {
  addNodeToCard,
  addEdgeToCard,
  deleteCardNode,
  type CardNode,
  type CardEdge,
} from '../../store/slices/cards-slice';
import { setSelectedNodes } from '../../store/slices/selection-slice';

interface ClipboardData {
  type: 'ice-clipboard';
  nodes: CardNode[];
  edges: CardEdge[];
}

const PASTE_OFFSET = 30;

export function useClipboard() {
  const dispatch = useDispatch<AppDispatch>();
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const activeCard = useSelector((state: RootState) => {
    const activeCardId = state.cards.activeCardId;
    return state.cards.cards.find((c) => c.id === activeCardId);
  });

  // Store in ref to avoid stale closures
  const selectedNodesRef = useRef(selectedNodes);
  selectedNodesRef.current = selectedNodes;
  const activeCardRef = useRef(activeCard);
  activeCardRef.current = activeCard;

  const copySelectedNodes = useCallback((): ClipboardData | null => {
    const card = activeCardRef.current;
    const selected = selectedNodesRef.current;
    if (!card || selected.length === 0) return null;

    // Get all selected nodes including children of selected groups
    const allNodeIds = new Set<string>();
    const addNodeAndChildren = (nodeId: string) => {
      allNodeIds.add(nodeId);
      for (const node of card.nodes) {
        if (node.parentId === nodeId) {
          addNodeAndChildren(node.id);
        }
      }
    };
    for (const id of selected) {
      addNodeAndChildren(id);
    }

    // Get nodes
    const nodes = card.nodes.filter((n) => allNodeIds.has(n.id));

    // Get edges between selected nodes
    const edges = card.edges.filter((e) => allNodeIds.has(e.source) && allNodeIds.has(e.target));

    return { type: 'ice-clipboard', nodes, edges };
  }, []);

  const pasteNodes = useCallback(
    (data: ClipboardData) => {
      if (!data || data.type !== 'ice-clipboard') return;

      const idMap = new Map<string, string>();
      const newIds: string[] = [];

      // Generate new IDs
      for (const node of data.nodes) {
        const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        idMap.set(node.id, newId);
        newIds.push(newId);
      }

      // Sort: parents first, then children (so parentId references exist when children are added)
      const sortedNodes = [...data.nodes].sort((a, b) => {
        const aIsChild = a.parentId && idMap.has(a.parentId) ? 1 : 0;
        const bIsChild = b.parentId && idMap.has(b.parentId) ? 1 : 0;
        return aIsChild - bIsChild;
      });

      // Add nodes with new IDs and offset positions
      for (const node of sortedNodes) {
        const newNode: CardNode = {
          ...node,
          id: idMap.get(node.id)!,
          position: {
            x: node.position.x + PASTE_OFFSET,
            y: node.position.y + PASTE_OFFSET,
          },
          parentId: node.parentId ? idMap.get(node.parentId) || undefined : undefined,
          data: { ...node.data },
        };
        dispatch(addNodeToCard(newNode));
      }

      // Add edges with new IDs
      for (const edge of data.edges) {
        const newEdge: CardEdge = {
          ...edge,
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: idMap.get(edge.source) || edge.source,
          target: idMap.get(edge.target) || edge.target,
        };
        dispatch(addEdgeToCard(newEdge));
      }

      // Select the pasted nodes
      dispatch(setSelectedNodes(newIds));
    },
    [dispatch]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+C — Copy
      if (isCtrl && e.key === 'c') {
        const data = copySelectedNodes();
        if (data) {
          navigator.clipboard.writeText(JSON.stringify(data)).catch(() => {
            // Fallback: store in sessionStorage
            sessionStorage.setItem('ice-clipboard', JSON.stringify(data));
          });
        }
        return;
      }

      // Ctrl+X — Cut
      if (isCtrl && e.key === 'x') {
        const data = copySelectedNodes();
        if (data) {
          navigator.clipboard.writeText(JSON.stringify(data)).catch(() => {
            sessionStorage.setItem('ice-clipboard', JSON.stringify(data));
          });
          // Delete selected
          for (const nodeId of selectedNodesRef.current) {
            dispatch(deleteCardNode(nodeId));
          }
          dispatch(setSelectedNodes([]));
        }
        return;
      }

      // Ctrl+V — Paste
      if (isCtrl && e.key === 'v') {
        navigator.clipboard
          .readText()
          .then((text) => {
            try {
              const data = JSON.parse(text) as ClipboardData;
              if (data.type === 'ice-clipboard') {
                pasteNodes(data);
              }
            } catch {
              // Try sessionStorage fallback
              const stored = sessionStorage.getItem('ice-clipboard');
              if (stored) {
                try {
                  const data = JSON.parse(stored) as ClipboardData;
                  if (data.type === 'ice-clipboard') {
                    pasteNodes(data);
                  }
                } catch {
                  /* ignore */
                }
              }
            }
          })
          .catch(() => {
            // Clipboard API failed, try sessionStorage
            const stored = sessionStorage.getItem('ice-clipboard');
            if (stored) {
              try {
                const data = JSON.parse(stored) as ClipboardData;
                if (data.type === 'ice-clipboard') {
                  pasteNodes(data);
                }
              } catch {
                /* ignore */
              }
            }
          });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelectedNodes, pasteNodes, dispatch]);
}
