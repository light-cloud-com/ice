/**
 * `pipeline` domain — CI/CD-style auto-deploy rules + event log.
 *
 * Pipeline rules attach to a (cardId, nodeId) pair, react to GitHub
 * push events, and trigger / retry / cancel the corresponding deploys.
 * `detectFramework` runs a server-side scan of a repo's package
 * manifest to suggest a default rule template.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-5.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createPipelineAdapter(): IceAPI['pipeline'] {
  return {
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
  };
}
