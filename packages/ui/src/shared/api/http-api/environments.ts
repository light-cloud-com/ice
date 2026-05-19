/**
 * `environments` domain — multi-environment CRUD + promote/compare.
 *
 * Environments are owned by a project and named distinctly per
 * project (production, staging, etc.). The `promote` and `compare`
 * methods drive the env-promotion UI; `togglePrPreviews` flips the
 * project-level "auto-create preview env per PR" setting.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-5.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createEnvironmentsAdapter(): IceAPI['environments'] {
  return {
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
  };
}
