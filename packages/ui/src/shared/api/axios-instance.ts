/**
 * Axios Instance — Community Edition
 *
 * No JWT auth, no token refresh.
 * Auth is handled server-side via auto-seeded local user.
 */

import axios from 'axios';
import { logApiCall, logApiResponse } from '../utils/action-logger';

export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor — logging only
axiosInstance.interceptors.request.use(
  (config) => {
    const method = config.method || 'GET';
    const path = config.url || '';
    logApiCall(method, path, config.data);
    (config as any)._startTime = Date.now();
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — logging only
axiosInstance.interceptors.response.use(
  (response) => {
    const method = response.config.method || 'GET';
    const path = response.config.url || '';
    const duration = Date.now() - ((response.config as any)._startTime || Date.now());
    logApiResponse(method, path, response.status, response.data, duration);
    return response;
  },
  (error) => Promise.reject(error),
);

// Stubs for backwards compatibility with imports
export function setAccessToken(_token: string | null) {}
export function getAccessToken(): string | null {
  return null;
}

export default axiosInstance;
