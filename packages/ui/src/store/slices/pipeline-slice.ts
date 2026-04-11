/**
 * Pipeline Slice — CI/CD deployment rules, live status, and deployment history
 *
 * Manages:
 * - Per-node pipeline status (for canvas ⚡ badges)
 * - Deployment rules (branch → environment mapping)
 * - Deployment event history
 * - Framework detection cache
 * - Socket.IO subscriptions for real-time updates
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getApi } from '../../shared/api/api-adapter';

// ─── Types ──────────────────────────────────────────────────────────────────

type PipelineStatus = 'idle' | 'queued' | 'building' | 'deploying' | 'success' | 'failed';

export interface DeployStep {
  step: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  duration_ms?: number;
}

export interface DeploymentRule {
  id: string;
  card_id: string;
  node_id: string;
  repository: string;
  trigger_type: string;
  branch_pattern: string;
  environment: string;
  build_command: string | null;
  install_command: string | null;
  output_dir: string | null;
  framework: string | null;
  enabled: boolean;
  webhook_id: number | null;
  created_at: string;
}

export interface DeploymentEvent {
  id: string;
  rule_id: string;
  trigger: string;
  commit_sha: string;
  commit_message: string | null;
  commit_author: string | null;
  branch: string;
  status: string;
  deployment_stage: string | null;
  deployment_logs: DeployStep[];
  deployed_url: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  error: string | null;
  rule?: { branch_pattern: string; environment: string };
}

export interface NodePipelineStatus {
  status: PipelineStatus;
  stage?: string;
  commitSha?: string;
  commitMessage?: string;
  commitAuthor?: string;
  branch?: string;
  progress?: number;
  startedAt?: string;
  durationSeconds?: number;
  error?: string;
}

export interface FrameworkDetection {
  framework: string | null;
  runtime: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  packageManager: string | null;
  confidence: 'high' | 'medium' | 'low';
  detectedFiles: string[];
}

interface PipelineState {
  // Per-node pipeline status (for canvas badges)
  nodeStatus: Record<string, NodePipelineStatus>;

  // Active panel
  activePanelNodeId: string | null;
  activePanelCardId: string | null;
  isPanelOpen: boolean;

  // Rules per node (keyed by "cardId:nodeId")
  rules: Record<string, DeploymentRule[]>;
  rulesLoading: boolean;

  // Deployment history per node
  history: Record<string, DeploymentEvent[]>;
  historyLoading: boolean;

  // Live logs for active deployment (when panel is open)
  activeLogs: DeployStep[];

  // Framework detection cache (keyed by "owner/repo")
  detectedFrameworks: Record<string, FrameworkDetection>;
  detectingFramework: boolean;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState: PipelineState = {
  nodeStatus: {},
  activePanelNodeId: null,
  activePanelCardId: null,
  isPanelOpen: false,
  rules: {},
  rulesLoading: false,
  history: {},
  historyLoading: false,
  activeLogs: [],
  detectedFrameworks: {},
  detectingFramework: false,
};

// ─── Async Thunks ───────────────────────────────────────────────────────────

export const fetchRulesForNode = createAsyncThunk(
  'pipeline/fetchRulesForNode',
  async ({ cardId, nodeId }: { cardId: string; nodeId: string }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.getRules(cardId, nodeId);
      if (!result.success) return rejectWithValue(result.error);
      return { key: `${cardId}:${nodeId}`, rules: result.rules };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const createPipelineRule = createAsyncThunk(
  'pipeline/createRule',
  async (
    input: {
      cardId: string;
      nodeId: string;
      repository: string;
      triggerType?: string;
      branchPattern?: string;
      environment?: string;
      buildCommand?: string;
      installCommand?: string;
      outputDir?: string;
      framework?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      const result = await getApi().pipeline.createRule(input);
      if (!result.success) return rejectWithValue(result.error);
      return { key: `${input.cardId}:${input.nodeId}`, rule: result.rule };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const updatePipelineRule = createAsyncThunk(
  'pipeline/updateRule',
  async ({ ruleId, updates }: { ruleId: string; updates: any }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.updateRule(ruleId, updates);
      if (!result.success) return rejectWithValue(result.error);
      return result.rule;
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const deletePipelineRule = createAsyncThunk(
  'pipeline/deleteRule',
  async ({ ruleId, cardId, nodeId }: { ruleId: string; cardId: string; nodeId: string }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.deleteRule(ruleId);
      if (!result.success) return rejectWithValue(result.error);
      return { key: `${cardId}:${nodeId}`, ruleId };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchEventsForNode = createAsyncThunk(
  'pipeline/fetchEventsForNode',
  async ({ cardId, nodeId }: { cardId: string; nodeId: string }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.getEvents(cardId, nodeId);
      if (!result.success) return rejectWithValue(result.error);
      return { key: `${cardId}:${nodeId}`, events: result.events };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const detectFramework = createAsyncThunk(
  'pipeline/detectFramework',
  async ({ repository, branch }: { repository: string; branch?: string }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.detectFramework(repository, branch);
      if (!result.success) return rejectWithValue(result.error);
      return { repository, detection: result.detection };
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

export const triggerManualDeploy = createAsyncThunk(
  'pipeline/triggerManualDeploy',
  async ({ ruleId, branch }: { ruleId: string; branch?: string }, { rejectWithValue }) => {
    try {
      const result = await getApi().pipeline.triggerDeploy(ruleId, branch);
      if (!result.success) return rejectWithValue(result.error);
      return result.event;
    } catch (err: any) {
      return rejectWithValue(err.message);
    }
  },
);

// ─── Slice ──────────────────────────────────────────────────────────────────

const pipelineSlice = createSlice({
  name: 'pipeline',
  initialState,
  reducers: {
    openPipelinePanel(state, action: PayloadAction<{ nodeId: string; cardId: string }>) {
      state.isPanelOpen = true;
      state.activePanelNodeId = action.payload.nodeId;
      state.activePanelCardId = action.payload.cardId;
      state.activeLogs = [];
    },
    closePipelinePanel(state) {
      state.isPanelOpen = false;
      state.activePanelNodeId = null;
      state.activePanelCardId = null;
      state.activeLogs = [];
    },

    // Socket.IO: full pipeline update (for panel view)
    receivePipelineUpdate(
      state,
      action: PayloadAction<{
        nodeId: string;
        cardId: string;
        status: string;
        deployment_stage?: string;
        deployment_logs?: DeployStep[];
        commit_sha?: string;
        commit_message?: string;
        commit_author?: string;
        branch?: string;
        progress?: number;
        error?: string;
        started_at?: string;
        duration_seconds?: number;
      }>,
    ) {
      const p = action.payload;
      state.nodeStatus[p.nodeId] = {
        status: p.status as PipelineStatus,
        stage: p.deployment_stage || undefined,
        commitSha: p.commit_sha,
        commitMessage: p.commit_message || undefined,
        commitAuthor: p.commit_author || undefined,
        branch: p.branch,
        progress: p.progress,
        startedAt: p.started_at,
        durationSeconds: p.duration_seconds || undefined,
        error: p.error || undefined,
      };

      // Update live logs if panel is open for this node
      if (state.activePanelNodeId === p.nodeId && p.deployment_logs) {
        state.activeLogs = p.deployment_logs;
      }
    },

    // Socket.IO: lightweight card-level update (for canvas badges)
    receiveCardPipelineUpdate(
      state,
      action: PayloadAction<{
        nodeId: string;
        status: string;
        deployment_stage?: string;
        commit_sha?: string;
        commit_message?: string;
        progress?: number;
      }>,
    ) {
      const p = action.payload;
      const existing = state.nodeStatus[p.nodeId] || { status: 'idle' };
      state.nodeStatus[p.nodeId] = {
        ...existing,
        status: p.status as PipelineStatus,
        stage: p.deployment_stage || existing.stage,
        commitSha: p.commit_sha || existing.commitSha,
        commitMessage: p.commit_message || existing.commitMessage,
        progress: p.progress ?? existing.progress,
      };
    },

    clearNodeStatus(state, action: PayloadAction<string>) {
      delete state.nodeStatus[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      // Rules
      .addCase(fetchRulesForNode.pending, (state) => {
        state.rulesLoading = true;
      })
      .addCase(fetchRulesForNode.fulfilled, (state, action) => {
        state.rulesLoading = false;
        state.rules[action.payload.key] = action.payload.rules;
      })
      .addCase(fetchRulesForNode.rejected, (state, action) => {
        state.rulesLoading = false;
        // Set empty array so rulesLoadedOnce becomes true even on failure
        const key =
          (action.meta.arg as any)?.cardId && (action.meta.arg as any)?.nodeId
            ? `${(action.meta.arg as any).cardId}:${(action.meta.arg as any).nodeId}`
            : null;
        if (key && !(key in state.rules)) state.rules[key] = [];
      })

      .addCase(createPipelineRule.fulfilled, (state, action) => {
        const { key, rule } = action.payload;
        if (!state.rules[key]) state.rules[key] = [];
        // Dedupe by id — `createRule` is idempotent on the backend and
        // returns the existing row on duplicate (card_id, node_id,
        // branch_pattern). Without this filter, React StrictMode double-
        // mount or concurrent auto-create effects would push the same
        // rule twice and trigger "duplicate key" render warnings.
        const existingIdx = state.rules[key].findIndex((r) => r.id === rule.id);
        if (existingIdx >= 0) {
          state.rules[key][existingIdx] = rule;
        } else {
          state.rules[key].push(rule);
        }
      })

      .addCase(deletePipelineRule.fulfilled, (state, action) => {
        const { key, ruleId } = action.payload;
        if (state.rules[key]) {
          state.rules[key] = state.rules[key].filter((r) => r.id !== ruleId);
        }
      })

      .addCase(updatePipelineRule.fulfilled, (state, action) => {
        const updated = action.payload;
        const key = `${updated.card_id}:${updated.node_id}`;
        if (state.rules[key]) {
          state.rules[key] = state.rules[key].map((r) => (r.id === updated.id ? updated : r));
        }
      })

      // Events
      .addCase(fetchEventsForNode.pending, (state) => {
        state.historyLoading = true;
      })
      .addCase(fetchEventsForNode.fulfilled, (state, action) => {
        state.historyLoading = false;
        state.history[action.payload.key] = action.payload.events;
      })
      .addCase(fetchEventsForNode.rejected, (state) => {
        state.historyLoading = false;
      })

      // Framework detection
      .addCase(detectFramework.pending, (state) => {
        state.detectingFramework = true;
      })
      .addCase(detectFramework.fulfilled, (state, action) => {
        state.detectingFramework = false;
        state.detectedFrameworks[action.payload.repository] = action.payload.detection;
      })
      .addCase(detectFramework.rejected, (state) => {
        state.detectingFramework = false;
      });
  },
});

export const {
  openPipelinePanel,
  closePipelinePanel,
  receivePipelineUpdate,
  receiveCardPipelineUpdate,
  clearNodeStatus,
} = pipelineSlice.actions;

export default pipelineSlice.reducer;
