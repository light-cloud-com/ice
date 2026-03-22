/**
 * Axios Instance with JWT auth
 *
 * Mirrors the platform editor's axiosInstance pattern:
 * - Proactive token refresh before expiry
 * - Request queue during refresh
 * - Automatic logout on auth failure
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { logApiCall, logApiResponse } from '../utils/action-logger';

export const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Token refresh state
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

// Token storage (in-memory — Redux store is source of truth)
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (token) {
    localStorage.setItem('ice-token', token);
  } else {
    localStorage.removeItem('ice-token');
  }
}

export function getAccessToken(): string | null {
  if (_accessToken) return _accessToken;
  _accessToken = localStorage.getItem('ice-token');
  return _accessToken;
}

// Decode JWT to check expiration
const isTokenExpiringSoon = (token: string, thresholdSeconds = 60): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp * 1000;
    return Date.now() >= exp - thresholdSeconds * 1000;
  } catch {
    return true;
  }
};

// Refresh access token using httpOnly cookie
const refreshAccessToken = async (): Promise<string> => {
  const response = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
  return response.data.token;
};

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor — attach JWT, proactively refresh, and log
axiosInstance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Action logging
    const method = config.method || 'GET';
    const path = config.url || '';
    logApiCall(method, path, config.data);
    (config as any)._startTime = Date.now();
    let token = getAccessToken();

    if (token && isTokenExpiringSoon(token)) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          setAccessToken(newToken);
          token = newToken;
          processQueue(null, newToken);
        } catch (refreshError) {
          processQueue(refreshError as Error, null);
        } finally {
          isRefreshing = false;
        }
      } else {
        try {
          token = await new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
        } catch {
          // Refresh failed, proceed with old token
        }
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

const logoutAndClear = () => {
  axios.post(`${BASE_URL}/auth/logout`, {}, { withCredentials: true }).catch(() => {});
  setAccessToken(null);
  window.location.replace('/login');
};

// Response interceptor — log, handle 401, refresh, errors
axiosInstance.interceptors.response.use(
  (response) => {
    const method = response.config.method || 'GET';
    const path = response.config.url || '';
    const duration = Date.now() - ((response.config as any)._startTime || Date.now());
    logApiResponse(method, path, response.status, response.data, duration);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error?.response?.status === 429) {
      console.error('Rate limited. Please wait.');
      return Promise.reject(error);
    }

    if (error?.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        try {
          const newToken = await new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axiosInstance(originalRequest);
        } catch {
          logoutAndClear();
          return Promise.reject(error);
        }
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        setAccessToken(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        logoutAndClear();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
