/**
 * Deploy slice — panel + configuration reducers.
 *
 * Six trivial reducers that flip flags on the slice state. Spread into
 * `createSlice`'s `reducers` block in the orchestrator (`deploy-slice.ts`)
 * so RTK still owns the action type strings (`'deploy/openDeployPanel'`
 * etc.).
 *
 * - `openDeployPanel` / `closeDeployPanel` — toggle panel visibility.
 * - `setProvider` / `setGcpProject` / `setRegion` / `setEnvironment` —
 *   write the matching field directly from the action payload, and
 *   invalidate any existing plan (DF4): a plan reviewed for one destination
 *   must NOT be applied against a different provider/project/region/env.
 *
 * @see rf-dslice-3
 */

import type { DeployState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

// DF4 — a plan describes a specific destination. Changing any destination
// field makes the on-screen plan stale, so drop it (and roll a 'planned'
// status back to 'idle') forcing a re-plan before the user can Deploy. No-op
// when there's no plan, so the panel-open auto-detect (which dispatches
// setProvider/setRegion before any plan exists) is unaffected.
function invalidatePlan(state: DeployState) {
  if (state.plan) {
    state.plan = null;
    if (state.status === 'planned') state.status = 'idle';
  }
}

export const panelConfigReducers = {
  openDeployPanel: (state: DeployState) => {
    state.isOpen = true;
  },
  closeDeployPanel: (state: DeployState) => {
    state.isOpen = false;
  },

  // Configuration
  setProvider: (state: DeployState, action: PayloadAction<string>) => {
    state.provider = action.payload;
    invalidatePlan(state);
  },
  setGcpProject: (state: DeployState, action: PayloadAction<string>) => {
    state.gcpProject = action.payload;
    invalidatePlan(state);
  },
  setRegion: (state: DeployState, action: PayloadAction<string>) => {
    state.region = action.payload;
    invalidatePlan(state);
  },
  setEnvironment: (state: DeployState, action: PayloadAction<'development' | 'staging' | 'production'>) => {
    state.environment = action.payload;
    invalidatePlan(state);
  },
} as const;
