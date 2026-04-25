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

// Response interceptor — logs every response AND extracts the server's
// error body into the axios error message so the UI shows something
// useful instead of the generic "Request failed with status code 400".
axiosInstance.interceptors.response.use(
  (response) => {
    const method = response.config.method || 'GET';
    const path = response.config.url || '';
    const duration = Date.now() - ((response.config as any)._startTime || Date.now());
    logApiResponse(method, path, response.status, response.data, duration);
    return response;
  },
  (error) => {
    // Extract the most specific server-provided message we can find:
    //   1. response body { error: "..." } / { message: "..." }
    //   2. Raw response body (string)
    //   3. axios default message
    const status = error?.response?.status;
    const data = error?.response?.data;
    const method = (error?.config?.method || 'request').toUpperCase();
    const path = error?.config?.url || '';
    let serverMsg = '';
    if (data && typeof data === 'object') {
      serverMsg = data.error || data.message || JSON.stringify(data).slice(0, 400);
    } else if (typeof data === 'string' && data) {
      serverMsg = data.slice(0, 400);
    }
    const prefix = status ? `${method} ${path} → ${status}` : `${method} ${path}`;
    const enriched = serverMsg ? `${prefix}: ${serverMsg}` : prefix;
    try {
      error.message = enriched;
      if (error.response) {
        error.response.extractedMessage = serverMsg || error.message;
      }
    } catch {
      // Read-only error object — leave as-is.
    }
    // Also log the full details to the console so developers can see the
    // request body / stack immediately.

    console.error(`[api] ${enriched}`, {
      status,
      path,
      method,
      data,
      requestBody: error?.config?.data,
    });
    return Promise.reject(error);
  },
);

// Stubs for backwards compatibility with imports
export function setAccessToken(_token: string | null) {}
export function getAccessToken(): string | null {
  return null;
}

export default axiosInstance;
