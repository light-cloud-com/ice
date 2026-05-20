/**
 * `deploy` domain — full deploy lifecycle endpoints.
 *
 * Plan / apply / destroy / destroyAll / status / requirements /
 * deploy-stream replay / node-output queries / cleanup-orphans + the
 * `openExternal` helper for cross-launching auth URLs in a new tab.
 *
 * `authenticate` is a no-op stub — the web build is already
 * authenticated through the platform session, so the desktop's "open
 * cloud SDK browser" path is irrelevant.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-5.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createDeployAdapter(): IceAPI['deploy'] {
  return {
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
  };
}
