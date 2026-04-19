/**
 * Environments Slice — Server-backed environment management
 *
 * Each environment owns a CanvasCard. Production is the base.
 * Other environments are clones that can diverge and be promoted back.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getApi } from '../../shared/api/api-adapter';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Environment {
  id: string;
  project_id: string;
  card_id: string;
  name: string;
  type: 'production' | 'staging' | 'development' | 'pr';
  region: string | null;
  is_protected: boolean;
  pr_number: number | null;
  pr_branch: string | null;
  card?: { id: string; name: string; updated_at: string };
}

export interface EnvironmentDiffItem {
  status: 'added' | 'removed' | 'modified';
  nodeId: string;
  label: string;
  iceType: string;
  changedFields?: string[];
}

export interface EnvironmentDiff {
  added: EnvironmentDiffItem[];
  removed: EnvironmentDiffItem[];
  modified: EnvironmentDiffItem[];
  unchangedCount: number;
}

interface EnvironmentsState {
  byProject: Record<string, Environment[]>;
  activeEnvId: Record<string, string>; // projectId → envId
  loading: boolean;
  pendingDiff: EnvironmentDiff | null;
  pendingPromote: { sourceEnvId: string; targetEnvId: string } | null;
  promoting: boolean;
}

const initialState: EnvironmentsState = {
  byProject: {},
  activeEnvId: {},
  loading: false,
  pendingDiff: null,
  pendingPromote: null,
  promoting: false,
};

// ─── Thunks ─────────────────────────────────────────────────────────────────

export const fetchEnvironments = createAsyncThunk(
  'environments/fetch',
  async (projectId: string, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.list(projectId);
      if (!res.success) return rejectWithValue(res.error);
      return { projectId, environments: res.environments };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const createEnvironment = createAsyncThunk(
  'environments/create',
  async (input: { projectId: string; name: string; type: string; region?: string }, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.create(input);
      if (!res.success) return rejectWithValue(res.error);
      return { projectId: input.projectId, environment: res.environment };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const deleteEnvironment = createAsyncThunk(
  'environments/delete',
  async ({ envId, projectId }: { envId: string; projectId: string }, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.delete(envId);
      if (!res.success) return rejectWithValue(res.error);
      return { envId, projectId };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const renameEnvironment = createAsyncThunk(
  'environments/rename',
  async ({ envId, projectId, name }: { envId: string; projectId: string; name: string }, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.update(envId, { name });
      if (!res.success) return rejectWithValue(res.error);
      return { envId, projectId, name };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const compareEnvironments = createAsyncThunk(
  'environments/compare',
  async ({ sourceEnvId, targetEnvId }: { sourceEnvId: string; targetEnvId: string }, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.compare(sourceEnvId, targetEnvId);
      if (!res.success) return rejectWithValue(res.error);
      return { diff: res.diff, sourceEnvId, targetEnvId };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const promoteEnvironment = createAsyncThunk(
  'environments/promote',
  async ({ sourceEnvId, targetEnvId }: { sourceEnvId: string; targetEnvId: string }, { rejectWithValue }) => {
    try {
      const res = await getApi().environments.promote(sourceEnvId, targetEnvId);
      if (!res.success) return rejectWithValue(res.error);
      return { sourceEnvId, targetEnvId };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

// ─── Slice ──────────────────────────────────────────────────────────────────

const environmentsSlice = createSlice({
  name: 'environments',
  initialState,
  reducers: {
    setActiveEnvironment(state, action: PayloadAction<{ projectId: string; envId: string }>) {
      state.activeEnvId[action.payload.projectId] = action.payload.envId;
    },
    clearPendingDiff(state) {
      state.pendingDiff = null;
      state.pendingPromote = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnvironments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchEnvironments.fulfilled, (state, action) => {
        state.loading = false;
        const { projectId, environments } = action.payload;
        state.byProject[projectId] = environments;
        // Auto-select production if no active env
        if (!state.activeEnvId[projectId]) {
          const prod = environments.find((e: Environment) => e.type === 'production');
          if (prod) state.activeEnvId[projectId] = prod.id;
        }
      })
      .addCase(fetchEnvironments.rejected, (state) => {
        state.loading = false;
      })

      .addCase(createEnvironment.fulfilled, (state, action) => {
        const { projectId, environment } = action.payload;
        if (!state.byProject[projectId]) state.byProject[projectId] = [];
        state.byProject[projectId].push(environment);
      })

      .addCase(deleteEnvironment.fulfilled, (state, action) => {
        const { envId, projectId } = action.payload;
        if (state.byProject[projectId]) {
          state.byProject[projectId] = state.byProject[projectId].filter((e) => e.id !== envId);
        }
        if (state.activeEnvId[projectId] === envId) {
          const prod = state.byProject[projectId]?.find((e) => e.type === 'production');
          state.activeEnvId[projectId] = prod?.id || '';
        }
      })

      .addCase(renameEnvironment.fulfilled, (state, action) => {
        const { envId, projectId, name } = action.payload;
        const env = state.byProject[projectId]?.find((e) => e.id === envId);
        if (env) env.name = name;
      })

      .addCase(compareEnvironments.fulfilled, (state, action) => {
        state.pendingDiff = action.payload.diff;
        state.pendingPromote = {
          sourceEnvId: action.payload.sourceEnvId,
          targetEnvId: action.payload.targetEnvId,
        };
      })

      .addCase(promoteEnvironment.pending, (state) => {
        state.promoting = true;
      })
      .addCase(promoteEnvironment.fulfilled, (state) => {
        state.promoting = false;
        state.pendingDiff = null;
        state.pendingPromote = null;
      })
      .addCase(promoteEnvironment.rejected, (state) => {
        state.promoting = false;
      });
  },
});

export const { setActiveEnvironment, clearPendingDiff } = environmentsSlice.actions;
export default environmentsSlice.reducer;
