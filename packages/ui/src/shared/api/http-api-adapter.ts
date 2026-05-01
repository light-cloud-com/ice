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
    dialog: {
      openFile: async () => {
        return new Promise<string | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.ice,.json';
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsText(file);
            } else {
              resolve(null);
            }
          };
          input.click();
        });
      },
      saveFile: async () => {
        // Web version saves to cloud — use download for local export
        return null;
      },
      importTerraform: async () => {
        return new Promise<any>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.tf,.hcl';
          input.multiple = true;
          input.onchange = () => {
            resolve(input.files);
          };
          input.click();
        });
      },
      selectDirectory: async () => {
        // Not applicable for web — projects are cloud-stored
        return null;
      },
    },

    // ── Projects (cloud-stored) ────────────────────────────────────────
    projects: {
      scanDirectory: async () => {
        // Not applicable for web — projects are cloud-stored
        return { files: [], folders: [] };
      },
      createFolder: async () => {
        // Not applicable for web
        return null;
      },
    },

    // ── Provider credentials ───────────────────────────────────────────
    provider: {
      getCredentials: async (providerId: string) => {
        const res = await axiosInstance.get(`/providers/${providerId}/credentials`);
        return res.data;
      },
      saveCredentials: async (providerId: string, credentials: Record<string, string>) => {
        const res = await axiosInstance.post(`/providers/${providerId}/credentials`, { credentials });
        return res.data;
      },
      isConnected: async (providerId: string) => {
        const res = await axiosInstance.get(`/providers/${providerId}/status`);
        return res.data.connected;
      },
      connect: async (providerId: string, credentials: Record<string, string>) => {
        const res = await axiosInstance.post(`/providers/${providerId}/connect`, { credentials });
        return res.data;
      },
      disconnect: async (providerId: string) => {
        await axiosInstance.post(`/providers/${providerId}/disconnect`);
      },
      getProjects: async (providerId: string) => {
        const res = await axiosInstance.get(`/providers/${providerId}/projects`);
        return res.data;
      },
      import: async (providerId: string, projectId: string) => {
        const res = await axiosInstance.post(`/providers/${providerId}/import`, { projectId });
        return res.data;
      },
      exchangeGCPCode: async (code: string) => {
        const res = await axiosInstance.post('/providers/gcp/oauth/exchange', { code });
        return res.data;
      },
      connectGCPOAuth: async (accessToken: string, expiresIn: number) => {
        const res = await axiosInstance.post('/providers/gcp/oauth/connect', {
          access_token: accessToken,
          expires_in: expiresIn,
        });
        return res.data;
      },
    },

    // ── Templates ──────────────────────────────────────────────────────
    templates: {
      loadToGraph: async (_data) => {
        // In web version, templates are expanded client-side via config/templates
        // No backend call needed — Redux state is the source of truth
        return { success: true };
      },
    },

    // ── GitHub ──────────────────────────────────────────────────────────
    github: {
      isConnected: async () => {
        const res = await axiosInstance.get('/github/status');
        return res.data.connected;
      },
      getUser: async () => {
        const res = await axiosInstance.get('/github/user');
        const data = res.data;
        if (!data) return null;
        // Normalize: backend returns {login, avatar_url}, slice expects {username, avatarUrl}
        return {
          ...data,
          username: data.username || data.login,
          avatarUrl: data.avatarUrl || data.avatar_url,
        };
      },
      connectPAT: async (token: string) => {
        const res = await axiosInstance.post('/github/connect-pat', { token });
        return res.data;
      },
      startDeviceFlow: async () => {
        const res = await axiosInstance.post('/github/device-flow/start');
        return res.data;
      },
      pollDeviceFlow: async (deviceCode: string, interval: number) => {
        const res = await axiosInstance.post('/github/device-flow/poll', { deviceCode, interval });
        return res.data;
      },
      disconnect: async () => {
        await axiosInstance.post('/github/disconnect');
      },
      listRepos: async (page?: number) => {
        const res = await axiosInstance.get('/github/repos', { params: { page } });
        return res.data;
      },
      listBranches: async (owner: string, repo: string) => {
        const res = await axiosInstance.get(`/github/repos/${owner}/${repo}/branches`);
        return res.data;
      },
    },

    // ── Deploy ──────────────────────────────────────────────────────────
    deploy: {
      plan: async (cardId, nodes, edges, options) => {
        const res = await axiosInstance.post('/canvas/deploy/plan', { cardId, nodes, edges, options });
        return res.data;
      },
      apply: async (cardId, nodes, edges, options) => {
        const res = await axiosInstance.post('/canvas/deploy/apply', { cardId, nodes, edges, options });
        return res.data;
      },
      destroy: async (cardId, options) => {
        const res = await axiosInstance.post('/canvas/deploy/destroy', { cardId, options });
        return res.data;
      },
      destroyAll: async (cardId: string, options?: { gcpProject?: string }) => {
        const res = await axiosInstance.post('/canvas/deploy/destroy-all', {
          cardId,
          gcpProject: options?.gcpProject,
        });
        return res.data;
      },
      getStatus: async (deploymentId) => {
        const res = await axiosInstance.get(`/canvas/deploy/status/${deploymentId}`);
        return res.data;
      },
      authenticate: async () => {
        // Web version uses platform auth — already authenticated
        return { success: true };
      },
      getResources: async (cardId) => {
        const res = await axiosInstance.get(`/canvas/deploy/resources/${cardId}`);
        return res.data;
      },
      getDeployments: async (cardId) => {
        const res = await axiosInstance.get(`/canvas/deploy/history/${cardId}`);
        return res.data;
      },
      requirements: async (cardId: string, nodes: any[], options: any) => {
        const res = await axiosInstance.post('/canvas/deploy/requirements', { cardId, nodes, options });
        return res.data;
      },
      getCurrentDeploy: async (cardId: string) => {
        const res = await axiosInstance.get(`/canvas/deploy/current/${cardId}`);
        return res.data;
      },
      getDeployStream: async (cardId: string, since = 0, deploymentId?: string) => {
        const res = await axiosInstance.get(`/canvas/deploy/stream/${cardId}`, {
          params: { since, ...(deploymentId ? { deployment_id: deploymentId } : {}) },
        });
        return res.data;
      },
      getNodeOutputs: async (cardId: string, environment?: string) => {
        const res = await axiosInstance.get(`/canvas/deploy/node-outputs/${cardId}`, {
          params: environment ? { environment } : undefined,
        });
        return res.data;
      },
      cleanupOrphans: async (args?: { gcpProject?: string; dryRun?: boolean }) => {
        const res = await axiosInstance.post('/canvas/deploy/cleanup-orphans', args || {});
        return res.data;
      },
      openExternal: (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },

    // ── Pipeline ─────────────────────────────────────────────────────────
    pipeline: {
      getRules: async (cardId: string, nodeId: string) => {
        const res = await axiosInstance.get(`/pipeline/rules/${cardId}/${nodeId}`);
        return res.data;
      },
      createRule: async (input: any) => {
        const res = await axiosInstance.post('/pipeline/rules', input);
        return res.data;
      },
      updateRule: async (ruleId: string, updates: any) => {
        const res = await axiosInstance.put(`/pipeline/rules/${ruleId}`, updates);
        return res.data;
      },
      deleteRule: async (ruleId: string) => {
        const res = await axiosInstance.delete(`/pipeline/rules/${ruleId}`);
        return res.data;
      },
      getEvents: async (cardId: string, nodeId: string) => {
        const res = await axiosInstance.get(`/pipeline/events/${cardId}/${nodeId}`);
        return res.data;
      },
      detectFramework: async (repository: string, branch?: string) => {
        const res = await axiosInstance.post('/pipeline/detect-framework', { repository, branch });
        return res.data;
      },
      triggerDeploy: async (ruleId: string, branch?: string) => {
        const res = await axiosInstance.post('/pipeline/trigger', { ruleId, branch });
        return res.data;
      },
      retryDeploy: async (eventId: string) => {
        const res = await axiosInstance.post('/pipeline/retry', { eventId });
        return res.data;
      },
      cancelDeploy: async (eventId: string) => {
        const res = await axiosInstance.post('/pipeline/cancel', { eventId });
        return res.data;
      },
    },

    // ── Environments ─────────────────────────────────────────────────────
    environments: {
      list: async (projectId: string) => {
        const res = await axiosInstance.post('/environments/list', { projectId });
        return res.data;
      },
      create: async (input: { projectId: string; name: string; type: string; region?: string }) => {
        const res = await axiosInstance.post('/environments/create', input);
        return res.data;
      },
      update: async (envId: string, data: { name?: string; region?: string }) => {
        const res = await axiosInstance.post('/environments/update', { envId, ...data });
        return res.data;
      },
      delete: async (envId: string) => {
        const res = await axiosInstance.post('/environments/delete', { envId });
        return res.data;
      },
      compare: async (sourceEnvId: string, targetEnvId: string) => {
        const res = await axiosInstance.post('/environments/compare', { sourceEnvId, targetEnvId });
        return res.data;
      },
      promote: async (sourceEnvId: string, targetEnvId: string) => {
        const res = await axiosInstance.post('/environments/promote', { sourceEnvId, targetEnvId });
        return res.data;
      },
      togglePrPreviews: async (projectId: string, enabled: boolean) => {
        const res = await axiosInstance.post('/environments/pr-previews', { projectId, enabled });
        return res.data;
      },
    },

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
