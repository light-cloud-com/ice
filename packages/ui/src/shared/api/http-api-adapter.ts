/**
 * HTTP API Adapter
 *
 * Implements IceAPI using HTTP calls to the platform backend.
 * Replaces Electron IPC for the web version.
 */

import { DEPLOY_EVENT_CHANNEL, type DeployEvent } from '@ice/types';
import axiosInstance from './axios-instance';
import type { IceAPI } from './api-adapter';
import { emitMenuAction, getSocket, menuCallbacks } from './http-api/socket';
import { createGraphAdapter } from './http-api/graph';
import { createSchemaAdapter } from './http-api/schema';
import { createResourcesAdapter } from './http-api/resources';
import { createDialogAdapter } from './http-api/dialog';
import { createProjectsAdapter } from './http-api/projects';
import { createTemplatesAdapter } from './http-api/templates';
import { createProviderAdapter } from './http-api/provider';
import { createGithubAdapter } from './http-api/github';
import { createDeployAdapter } from './http-api/deploy';
import { createPipelineAdapter } from './http-api/pipeline';
import { createEnvironmentsAdapter } from './http-api/environments';

// Re-export for the existing public surface; consumers calling
// `emitMenuAction(...)` from the toolbar continue to work.
export { emitMenuAction };

// ─── HTTP API Adapter ────────────────────────────────────────────────────────

export function createHttpApiAdapter(): IceAPI {
  return {
    // ── Graph (canvas persistence via backend) ─────────────────────────
    graph: createGraphAdapter(),

    // ── Schema ─────────────────────────────────────────────────────────
    schema: createSchemaAdapter(),

    // ── Resources ──────────────────────────────────────────────────────
    resources: createResourcesAdapter(),

    // ── Dialog (web alternatives) ──────────────────────────────────────
    dialog: createDialogAdapter(),

    // ── Projects (cloud-stored) ────────────────────────────────────────
    projects: createProjectsAdapter(),

    // ── Provider credentials ───────────────────────────────────────────
    provider: createProviderAdapter(),

    // ── Templates ──────────────────────────────────────────────────────
    templates: createTemplatesAdapter(),

    // ── GitHub ──────────────────────────────────────────────────────────
    github: createGithubAdapter(),

    // ── Deploy ──────────────────────────────────────────────────────────
    deploy: createDeployAdapter(),

    // ── Pipeline ─────────────────────────────────────────────────────────
    pipeline: createPipelineAdapter(),

    // ── Environments ─────────────────────────────────────────────────────
    environments: createEnvironmentsAdapter(),

    // ── Canvas Log Terminal block (Cloud Logging tail) ─────────────────
    //
    // Two channels: HTTP (subscribe/unsubscribe — manages the server-side
    // stream lifecycle) and Socket.IO (joinRoom + per-event listeners —
    // delivers `logs:entry` etc.). The hook in `use-log-stream.ts` owns
    // the lifecycle; the adapter just exposes the primitives.
    logs: {
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
    },

    // ── Menu actions (web toolbar emits events) ────────────────────────
    onMenuAction: (callback: (action: string) => void) => {
      menuCallbacks.add(callback);
      return () => {
        menuCallbacks.delete(callback);
      };
    },

    // ── Deploy events (Socket.IO) ──────────────────────────────────────
    // pdl-7 — flipped from legacy `deploy:progress` channel + ad-hoc event
    // shapes to the typed pdl-2 contract (`deploy:event` channel,
    // discriminated union `DeployEvent`). The channel name is sourced from
    // the imported constant so a typo on either side surfaces at typecheck
    // time, not as silently-dropped events at runtime.
    onDeployEvent: (callback: (event: DeployEvent) => void) => {
      const s = getSocket();
      const wrapped = (event: DeployEvent) => {
        console.log(
          '[ice-socket] ' + DEPLOY_EVENT_CHANNEL,
          event?.type ?? '?',
          (event as any)?.node_id ?? (event as any)?.resource_name ?? '',
        );
        callback(event);
      };
      s.on(DEPLOY_EVENT_CHANNEL, wrapped);
      return () => {
        s.off(DEPLOY_EVENT_CHANNEL, wrapped);
      };
    },

    // ── Pipeline progress (Socket.IO) ──────────────────────────────────
    onPipelineUpdate: (callback: (event: any) => void) => {
      const s = getSocket();
      s.on('pipeline:update', callback);
      return () => {
        s.off('pipeline:update', callback);
      };
    },

    onCardPipelineUpdate: (callback: (event: any) => void) => {
      const s = getSocket();
      s.on('card-pipeline:update', callback);
      return () => {
        s.off('card-pipeline:update', callback);
      };
    },

    // ── Deploy room subscription (for Socket.IO room-based events) ───
    subscribeDeployProgress: (cardId: string) => {
      const s = getSocket();
      const emitSubscribe = () => {
        console.log('[ice-socket] subscribe:deploy', cardId, 'connected=', s.connected);
        s.emit('subscribe:deploy', cardId);
      };
      // Always emit immediately — socket.io buffers emits on disconnected
      // sockets and flushes them on connect, so this works regardless of
      // current connection state. Also register a connect listener so the
      // subscribe replays on every reconnect (without re-subscribing, a
      // dropped socket that reconnects loses its room membership and live
      // events stop reaching the client until the next full refresh).
      emitSubscribe();
      s.on('connect', emitSubscribe);
      return () => {
        s.off('connect', emitSubscribe);
        s.emit('unsubscribe:deploy', cardId);
      };
    },

    subscribePipeline: (nodeId: string) => {
      const s = getSocket();
      s.emit('subscribe:pipeline', nodeId);
      return () => {
        s.emit('unsubscribe:pipeline', nodeId);
      };
    },

    subscribeCardPipeline: (cardId: string) => {
      const s = getSocket();
      s.emit('subscribe:card-pipeline', cardId);
      return () => {
        s.emit('unsubscribe:card-pipeline', cardId);
      };
    },
  };
}
