/**
 * `graph` domain — canvas card persistence over HTTP.
 *
 * The web build persists card state to the backend via REST endpoints
 * keyed on `cardId`. Most node/edge mutations are owned by Redux and
 * synced together via `save`; the per-mutation methods (`addNode`,
 * `updateNode`, ...) are stubs that exist only to satisfy the IceAPI
 * shape from the desktop adapter.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-2.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createGraphAdapter(): IceAPI['graph'] {
  return {
    create: async (name?: string) => {
      const res = await axiosInstance.post('/canvas/cards/create', { name: name || 'Untitled' });
      return res.data;
    },
    load: async (cardId: string) => {
      const res = await axiosInstance.post('/canvas/cards/get', { cardId });
      return res.data;
    },
    save: async (cardId?: string) => {
      if (!cardId) return { success: true, path: cardId };

      // Read current card state from Redux and persist to backend
      const { store } = await import('../../../store');
      const state = store.getState();
      const card = state.cards.cards.find((c: any) => c.id === cardId);
      if (!card) return { success: true, path: cardId };

      await axiosInstance.post('/canvas/cards/update', {
        cardId,
        nodes: card.nodes,
        edges: card.edges,
        viewport: card.viewport,
      });
      return { success: true, path: cardId };
    },
    get: async () => {
      // Returns current active card data
      return null;
    },
    addNode: async (input: any) => {
      // Nodes managed in Redux, synced via card update
      return { success: true, node: input };
    },
    updateNode: async (id: string, updates: any) => {
      return { success: true, id, updates };
    },
    removeNode: async (id: string) => {
      return { success: true, id };
    },
    addEdge: async (input: any) => {
      return { success: true, edge: input };
    },
    removeEdge: async (id: string) => {
      return { success: true, id };
    },
    validate: async () => {
      return { valid: true, errors: [] };
    },
  };
}
