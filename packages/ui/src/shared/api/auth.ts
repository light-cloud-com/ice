/**
 * Auth utilities — Community Edition
 *
 * No login/signup — local user auto-seeded by gateway.
 * All requests are unauthenticated (auth middleware bypassed server-side).
 */

import axiosInstance from './axios-instance';

interface AuthUser {
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

/** Community edition: always authenticated (local user) */
export function isAuthenticated(): boolean {
  return true;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await axiosInstance.get('/auth/me');
    return res.data;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  // No-op in community edition
}

// Stubs kept for import compatibility across shared UI components
export async function login(_email: string, _password: string): Promise<LoginResponse> {
  throw new Error('Login not available in Community edition');
}
export async function register(_name: string, _email: string, _password: string): Promise<LoginResponse> {
  throw new Error('Registration not available in Community edition');
}
export async function refreshToken(): Promise<string | null> {
  return null;
}
export function setAccessToken(_token: string | null) {}
export function getAccessToken(): string | null {
  return null;
}
