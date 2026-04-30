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
 *   write the matching field directly from the action payload.
 *
 * @see rf-dslice-3
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeployState } from '../types';

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
  },
  setGcpProject: (state: DeployState, action: PayloadAction<string>) => {
    state.gcpProject = action.payload;
  },
  setRegion: (state: DeployState, action: PayloadAction<string>) => {
    state.region = action.payload;
  },
  setEnvironment: (state: DeployState, action: PayloadAction<'development' | 'staging' | 'production'>) => {
    state.environment = action.payload;
  },
} as const;
