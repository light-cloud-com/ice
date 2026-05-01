/**
 * `github` domain — GitHub authentication and repo / branch listing.
 *
 * The web build talks to platform-side `/github/*` endpoints rather
 * than to GitHub directly so the user's PAT / OAuth credentials never
 * land in the browser. `getUser` normalizes the backend's
 * `{login, avatar_url}` fields into the slice-friendly
 * `{username, avatarUrl}` shape.
 *
 * Extracted from `http-api-adapter.ts` in rf-httpapi-4.
 */

import axiosInstance from '../axios-instance';
import type { IceAPI } from '../api-adapter';

export function createGithubAdapter(): IceAPI['github'] {
  return {
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
  };
}
