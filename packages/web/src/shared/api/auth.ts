/**
 * Auth utilities for the web app
 */

import axiosInstance from './axios-instance';
import { setAccessToken, getAccessToken } from './axios-instance';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  organisationId: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await axiosInstance.post('/auth/login', { email, password });
  const { token, user } = res.data;
  setAccessToken(token);
  return { token, user };
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<LoginResponse> {
  const res = await axiosInstance.post('/auth/register', { name, email, password });
  const { token, user } = res.data;
  setAccessToken(token);
  return { token, user };
}

export async function refreshToken(): Promise<string | null> {
  try {
    const res = await axiosInstance.post('/auth/refresh');
    const { token } = res.data;
    setAccessToken(token);
    return token;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await axiosInstance.post('/auth/logout');
  } catch {
    // Ignore — clearing local state regardless
  }
  setAccessToken(null);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await axiosInstance.get('/auth/me');
    return res.data;
  } catch {
    return null;
  }
}

export { setAccessToken, getAccessToken };
