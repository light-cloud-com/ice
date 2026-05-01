/**
 * `provider` domain — cloud-provider credential + project management.
 *
 * Each provider (AWS, GCP, Azure) owns its own credential vault, OAuth
 * flow, project list, and project-import endpoint. The GCP-specific
 * `exchangeGCPCode` / `connectGCPOAuth` paths live alongside the
 * generic provider methods because that's how the desktop adapter
 * shaped them — the IceAPI surface co-locates them under `provider.*`.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-4.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createProviderAdapter(): IceAPI['provider'] {
  return {
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
  };
}
