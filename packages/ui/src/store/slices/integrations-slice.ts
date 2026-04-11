/**
 * Integrations Slice — Tracks connection status for all providers
 *
 * Manages GitHub auth (PAT + Device Flow), repo/branch listing,
 * and generic integration status for GCP/AWS/Azure/etc.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getApi } from '../../shared/api/api-adapter';

// =============================================================================
// Types
// =============================================================================

export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface IntegrationInfo {
  status: IntegrationStatus;
  username?: string;
  avatarUrl?: string;
  error?: string;
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

interface DeviceFlowState {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
}

interface IntegrationsState {
  integrations: Record<string, IntegrationInfo>;
  github: {
    repos: GitHubRepo[];
    branches: Record<string, GitHubBranch[]>;
    deviceFlow: DeviceFlowState | null;
    loading: boolean;
    /** Last error from fetchGitHubRepos, rendered inline in the RepoSelector. */
    reposError?: string;
    reposFetchedAt?: string;
  };
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: IntegrationsState = {
  integrations: {
    github: { status: 'disconnected' },
    gcp: { status: 'disconnected' },
    aws: { status: 'disconnected' },
    azure: { status: 'disconnected' },
  },
  github: {
    repos: [],
    branches: {},
    deviceFlow: null,
    loading: false,
  },
};

// =============================================================================
// Async Thunks
// =============================================================================

export const checkGitHubConnection = createAsyncThunk('integrations/checkGitHubConnection', async () => {
  const api = getApi();
  const connected = await api.github.isConnected();
  if (connected) {
    const user = await api.github.getUser();
    return user;
  }
  return null;
});

export const connectGitHubPAT = createAsyncThunk(
  'integrations/connectGitHubPAT',
  async (token: string, { rejectWithValue }) => {
    const api = getApi();
    try {
      const result = await api.github.connectPAT(token);
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      return result.user;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || err.message || 'Failed to connect');
    }
  },
);

export const startGitHubDeviceFlow = createAsyncThunk(
  'integrations/startGitHubDeviceFlow',
  async (_, { dispatch, rejectWithValue }) => {
    const api = getApi();
    let result: any;
    try {
      result = await api.github.startDeviceFlow();
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || err.message || 'Device flow failed');
    }
    if (!result.success) {
      return rejectWithValue(result.error);
    }

    dispatch(
      integrationsSlice.actions.setDeviceFlow({
        userCode: result.user_code,
        verificationUri: result.verification_uri,
        deviceCode: result.device_code,
        interval: result.interval,
      }),
    );

    dispatch(
      pollGitHubDeviceFlow({
        deviceCode: result.device_code,
        interval: result.interval,
      }),
    );

    return result;
  },
);

const pollGitHubDeviceFlow = createAsyncThunk(
  'integrations/pollGitHubDeviceFlow',
  async ({ deviceCode, interval }: { deviceCode: string; interval: number }, { rejectWithValue }) => {
    const api = getApi();
    try {
      const result = await api.github.pollDeviceFlow(deviceCode, interval);
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      return result.user;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || err.message || 'Device flow failed');
    }
  },
);

export const disconnectGitHub = createAsyncThunk('integrations/disconnectGitHub', async () => {
  const api = getApi();
  await api.github.disconnect();
});

export const fetchGitHubRepos = createAsyncThunk(
  'integrations/fetchGitHubRepos',
  async (page: number | undefined, { rejectWithValue }) => {
    const api = getApi();
    try {
      const result = await api.github.listRepos(page);
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      return result.repos;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || err.message || 'Failed to fetch repos');
    }
  },
);

export const fetchGitHubBranches = createAsyncThunk(
  'integrations/fetchGitHubBranches',
  async (repository: string, { rejectWithValue }) => {
    const api = getApi();
    try {
      const [owner, repo] = repository.split('/');
      if (!owner || !repo) return rejectWithValue('Invalid repository format');
      const result = await api.github.listBranches(owner, repo);
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      return { repository, branches: result.branches };
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.error || err.message || 'Failed to fetch branches');
    }
  },
);

// =============================================================================
// Slice
// =============================================================================

const integrationsSlice = createSlice({
  name: 'integrations',
  initialState,
  reducers: {
    setDeviceFlow(state, action: PayloadAction<DeviceFlowState | null>) {
      state.github.deviceFlow = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkGitHubConnection.fulfilled, (state, action) => {
        if (action.payload) {
          state.integrations.github = {
            status: 'connected',
            username: action.payload.username,
            avatarUrl: action.payload.avatarUrl,
          };
        } else {
          state.integrations.github = { status: 'disconnected' };
        }
      })
      .addCase(connectGitHubPAT.pending, (state) => {
        state.integrations.github = { status: 'connecting' };
      })
      .addCase(connectGitHubPAT.fulfilled, (state, action) => {
        state.integrations.github = {
          status: 'connected',
          username: action.payload.login,
          avatarUrl: action.payload.avatar_url,
        };
      })
      .addCase(connectGitHubPAT.rejected, (state, action) => {
        state.integrations.github = {
          status: 'error',
          error: action.payload as string,
        };
      })
      .addCase(startGitHubDeviceFlow.pending, (state) => {
        state.integrations.github = { status: 'connecting' };
      })
      .addCase(startGitHubDeviceFlow.rejected, (state, action) => {
        state.integrations.github = {
          status: 'error',
          error: action.payload as string,
        };
        state.github.deviceFlow = null;
      })
      .addCase(pollGitHubDeviceFlow.fulfilled, (state, action) => {
        state.integrations.github = {
          status: 'connected',
          username: action.payload.login,
          avatarUrl: action.payload.avatar_url,
        };
        state.github.deviceFlow = null;
      })
      .addCase(pollGitHubDeviceFlow.rejected, (state, action) => {
        state.integrations.github = {
          status: 'error',
          error: action.payload as string,
        };
        state.github.deviceFlow = null;
      })
      .addCase(disconnectGitHub.fulfilled, (state) => {
        state.integrations.github = { status: 'disconnected' };
        state.github.repos = [];
        state.github.branches = {};
        state.github.deviceFlow = null;
      })
      .addCase(fetchGitHubRepos.pending, (state) => {
        state.github.loading = true;
        state.github.reposError = undefined;
      })
      .addCase(fetchGitHubRepos.fulfilled, (state, action) => {
        state.github.repos = action.payload;
        state.github.loading = false;
        state.github.reposError = undefined;
        state.github.reposFetchedAt = new Date().toISOString();
      })
      .addCase(fetchGitHubRepos.rejected, (state, action) => {
        state.github.loading = false;
        state.github.reposError =
          (action.payload as string | undefined) ||
          action.error?.message ||
          'Failed to load repositories.';
      })
      .addCase(fetchGitHubBranches.fulfilled, (state, action) => {
        state.github.branches[action.payload.repository] = action.payload.branches;
      });
  },
});

export const { setDeviceFlow } = integrationsSlice.actions;
export default integrationsSlice.reducer;
