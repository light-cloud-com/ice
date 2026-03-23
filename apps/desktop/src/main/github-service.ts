/**
 * GitHub Service — Main process GitHub integration
 *
 * Handles PAT and OAuth Device Flow authentication, plus
 * GitHub REST API calls for repos and branches.
 * All credentials stored via electron-store.
 */

import { shell } from 'electron';
import Store from 'electron-store';

// =============================================================================
// Types
// =============================================================================

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

interface StoredGitHubCredentials {
  token: string;
  username: string;
  avatarUrl: string;
  name: string | null;
  connectedAt: string;
}

// =============================================================================
// Constants
// =============================================================================

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH_BASE = 'https://github.com';

// GitHub OAuth App Client ID — register at https://github.com/settings/applications/new
// Device Flow requires the app to have "Device Flow" enabled in settings.
// REQUIRED: Set GITHUB_CLIENT_ID environment variable before using GitHub features.
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';

const CREDENTIAL_KEY = 'github';

// =============================================================================
// GitHubService
// =============================================================================

export class GitHubService {
  private store: Store;

  constructor(credentialStore: Store) {
    this.store = credentialStore;
  }

  // ===========================================================================
  // PAT Authentication
  // ===========================================================================

  async connectWithPAT(token: string): Promise<GitHubUser> {
    const user = await this.fetchUser(token);
    this.saveCredentials(token, user);
    return user;
  }

  // ===========================================================================
  // OAuth Device Flow
  // ===========================================================================

  async startDeviceFlow(): Promise<DeviceFlowResponse> {
    const response = await fetch(`${GITHUB_OAUTH_BASE}/login/device/code`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
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

  async pollDeviceFlow(deviceCode: string, interval: number): Promise<GitHubUser> {
    const pollInterval = Math.max(interval, 5) * 1000; // GitHub minimum 5s

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const response = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const data = (await response.json()) as Record<string, string>;

      if (data.access_token) {
        const user = await this.fetchUser(data.access_token);
        this.saveCredentials(data.access_token, user);
        return user;
      }

      if (data.error === 'authorization_pending') {
        continue; // Keep polling
      }

      if (data.error === 'slow_down') {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Extra wait
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

  openDeviceFlowPage(verificationUri: string): void {
    shell.openExternal(verificationUri);
  }

  // ===========================================================================
  // GitHub API
  // ===========================================================================

  async getUser(): Promise<GitHubUser | null> {
    const token = this.getToken();
    if (!token) return null;
    try {
      return await this.fetchUser(token);
    } catch {
      return null;
    }
  }

  async listRepos(page = 1, perPage = 30): Promise<GitHubRepo[]> {
    const token = this.getToken();
    if (!token) throw new Error('Not connected to GitHub');

    const response = await fetch(`${GITHUB_API}/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list repos: ${response.status}`);
    }

    return response.json() as Promise<GitHubRepo[]>;
  }

  async listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const token = this.getToken();
    if (!token) throw new Error('Not connected to GitHub');

    const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list branches: ${response.status}`);
    }

    return response.json() as Promise<GitHubBranch[]>;
  }

  // ===========================================================================
  // Credential Management
  // ===========================================================================

  isConnected(): boolean {
    return !!this.getToken();
  }

  getStoredUser(): { username: string; avatarUrl: string; name: string | null } | null {
    const creds = this.store.get(`github.credentials`) as StoredGitHubCredentials | undefined;
    if (!creds) return null;
    return { username: creds.username, avatarUrl: creds.avatarUrl, name: creds.name };
  }

  disconnect(): void {
    this.store.delete(`github.credentials`);
    this.store.delete(`connected.${CREDENTIAL_KEY}`);
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private getToken(): string | null {
    const creds = this.store.get(`github.credentials`) as StoredGitHubCredentials | undefined;
    return creds?.token ?? null;
  }

  private saveCredentials(token: string, user: GitHubUser): void {
    const creds: StoredGitHubCredentials = {
      token,
      username: user.login,
      avatarUrl: user.avatar_url,
      name: user.name,
      connectedAt: new Date().toISOString(),
    };
    this.store.set(`github.credentials`, creds);
    this.store.set(`connected.${CREDENTIAL_KEY}`, true);
  }

  private async fetchUser(token: string): Promise<GitHubUser> {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid or expired GitHub token');
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<GitHubUser>;
  }
}
