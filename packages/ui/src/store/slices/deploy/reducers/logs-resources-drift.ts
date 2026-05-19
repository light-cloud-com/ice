/**
 * Deploy slice — logs + deployed-resources + drift reducers.
 *
 * Five small reducers grouped together because each is 2–6 LOC and they
 * share no mid-deploy state machinery; splitting them three ways would
 * inflate import boilerplate without buying clarity.
 *
 * - `appendLog` — push a string onto `logs`.
 * - `setDeployedResources` — replace the monitoring snapshot.
 * - `setDriftCheckLoading` — flip the drift-check spinner.
 * - `setDriftResults` — replace `driftByNode` with the keyed map and turn
 *   the spinner off.
 * - `clearDrift` — reset both drift fields to their initial shape.
 *
 * @see rf-dslice-9
 */

import type { DeployedResource, DeployState, NodeDriftInfo } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const logsResourcesDriftReducers = {
  appendLog: (state: DeployState, action: PayloadAction<string>) => {
    state.logs.push(action.payload);
  },

  // Deployed resources (for monitoring)
  setDeployedResources: (state: DeployState, action: PayloadAction<DeployedResource[]>) => {
    state.deployedResources = action.payload;
  },

  // Drift detection
  setDriftCheckLoading: (state: DeployState, action: PayloadAction<boolean>) => {
    state.driftCheckLoading = action.payload;
  },
  setDriftResults: (state: DeployState, action: PayloadAction<NodeDriftInfo[]>) => {
    state.driftByNode = {};
    for (const info of action.payload) {
      state.driftByNode[info.nodeId] = info;
    }
    state.driftCheckLoading = false;
  },
  clearDrift: (state: DeployState) => {
    state.driftByNode = {};
    state.driftCheckLoading = false;
  },
} as const;
