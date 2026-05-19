/**
 * `logs` domain — Cloud Logging tail for Canvas Log Terminal blocks.
 *
 * Two channels carry log data:
 *   - HTTP `subscribe` / `unsubscribe` — manage the server-side
 *     stream lifecycle (back-pressure, query, retention).
 *   - Socket.IO `joinRoom` + per-event listeners — deliver `logs:entry`,
 *     `logs:error`, `logs:resumed`, `logs:source-resolved`.
 *
 * The `useLogStream` hook owns the lifecycle; the adapter just exposes
 * the primitives. The `joinRoom` `subscribe:logs` emit replays on
 * every reconnect so a dropped socket regains room membership without
 * a full page refresh — same pattern as `subscribeDeployProgress`.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-6.
 */

import axiosInstance from '../axios-instance';
import { getSocket } from './socket';
import type { IceAPI } from '../api-adapter';

export function createLogsAdapter(): IceAPI['logs'] {
  return {
    subscribe: async (args) => {
      const res = await axiosInstance.post('/canvas/logs/subscribe', args);
      return res.data;
    },
    unsubscribe: async (subscriptionId: string, cardId: string) => {
      await axiosInstance.post('/canvas/logs/unsubscribe', { subscriptionId, cardId });
    },
    joinRoom: (terminalNodeId: string) => {
      const s = getSocket();
      const emitJoin = () => s.emit('subscribe:logs', terminalNodeId);
      // Same pattern as `subscribeDeployProgress`: emit immediately
      // (socket.io buffers when disconnected) AND on every reconnect
      // so a dropped socket regains room membership transparently.
      emitJoin();
      s.on('connect', emitJoin);
      return () => {
        s.off('connect', emitJoin);
        s.emit('unsubscribe:logs', terminalNodeId);
      };
    },
    onEntry: (callback) => {
      const s = getSocket();
      s.on('logs:entry', callback);
      return () => {
        s.off('logs:entry', callback);
      };
    },
    onError: (callback) => {
      const s = getSocket();
      s.on('logs:error', callback);
      return () => {
        s.off('logs:error', callback);
      };
    },
    onResumed: (callback) => {
      const s = getSocket();
      s.on('logs:resumed', callback);
      return () => {
        s.off('logs:resumed', callback);
      };
    },
    onSourceResolved: (callback) => {
      const s = getSocket();
      s.on('logs:source-resolved', callback);
      return () => {
        s.off('logs:source-resolved', callback);
      };
    },
  };
}
