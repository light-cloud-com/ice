/**
 * GitHub Service — Ported from ICE desktop github-service.ts
 *
 * Replaces electron-store with Prisma GitHubToken model (encrypted).
 * All functions take userId for per-user credential scoping.
 */

import prisma from '@ice/db';
import { encryptString, decryptString } from '@ice/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH_BASE = 'https://github.com';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function connectWithPAT(userId: string, token: string): Promise<GitHubUser> {
  const user = await fetchGitHubUser(token);
  await saveToken(userId, token, user);
  return user;
}

export async function startDeviceFlow(): Promise<DeviceFlowResponse> {
  if (!GITHUB_CLIENT_ID) {
    throw new Error('GITHUB_CLIENT_ID not configured. Set it in environment variables.');
  }

  const response = await fetch(`${GITHUB_OAUTH_BASE}/login/device/code`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'repo read:user',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Device flow failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<DeviceFlowResponse>;
}

export async function pollDeviceFlow(userId: string, deviceCode: string, interval: number): Promise<GitHubUser> {
  const pollInterval = Math.max(interval, 5) * 1000;

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const response = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = (await response.json()) as Record<string, string>;

    if (data.access_token) {
      const user = await fetchGitHubUser(data.access_token);
      await saveToken(userId, data.access_token, user);
      return user;
    }

    if (data.error === 'authorization_pending') continue;

    if (data.error === 'slow_down') {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (data.error === 'access_denied') {
      throw new Error('Authorization was denied by the user.');
    }

    throw new Error(data.error_description || data.error || 'Unknown device flow error');
  }
}

export async function disconnect(userId: string): Promise<void> {
  await prisma.gitHubToken.deleteMany({ where: { user_id: userId } });
}

// ─── Status ─────────────────────────────────────────────────────────────────

export async function isConnected(userId: string): Promise<boolean> {
  const token = await getToken(userId);
  return !!token;
}

export async function getStoredUser(userId: string): Promise<GitHubUser | null> {
  const record = await prisma.gitHubToken.findUnique({ where: { user_id: userId } });
  if (!record) return null;

  return {
    login: record.username,
    avatar_url: record.avatar_url || '',
    name: record.name,
    html_url: `https://github.com/${record.username}`,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function listRepos(userId: string, page = 1, perPage = 30): Promise<GitHubRepo[]> {
  const token = await getToken(userId);
  if (!token) throw new Error('Not connected to GitHub');

  const response = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`, {
    headers: { Authorization: `Bearer ${token}`, ...GITHUB_HEADERS },
  });

  if (!response.ok) throw new Error(`Failed to list repos: ${response.status}`);
  return response.json() as Promise<GitHubRepo[]>;
}

export async function listBranches(userId: string, owner: string, repo: string): Promise<GitHubBranch[]> {
  const token = await getToken(userId);
  if (!token) throw new Error('Not connected to GitHub');

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, ...GITHUB_HEADERS },
  });

  if (!response.ok) throw new Error(`Failed to list branches: ${response.status}`);
  return response.json() as Promise<GitHubBranch[]>;
}

// ─── Internal ───────────────────────────────────────────────────────────────

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, ...GITHUB_HEADERS },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid or expired GitHub token');
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

async function getToken(userId: string): Promise<string | null> {
  const record = await prisma.gitHubToken.findUnique({ where: { user_id: userId } });
  if (!record) return null;

  try {
    return decryptString(record.access_token);
  } catch {
    // Fallback for unencrypted tokens
    return record.access_token;
  }
}

async function saveToken(userId: string, token: string, user: GitHubUser): Promise<void> {
  const encrypted = encryptString(token);

  await prisma.gitHubToken.upsert({
    where: { user_id: userId },
    update: {
      access_token: encrypted,
      username: user.login,
      avatar_url: user.avatar_url,
      name: user.name,
      scope: 'repo read:user',
    },
    create: {
      user_id: userId,
      access_token: encrypted,
      username: user.login,
      avatar_url: user.avatar_url,
      name: user.name,
      scope: 'repo read:user',
    },
  });
}
