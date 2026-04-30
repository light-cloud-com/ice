/**
 * Deploy slice — AI-Native #3 pre-deploy warning reducers.
 *
 * Three reducers that gate the Deploy button on user acknowledgement of
 * security + cost warnings.
 *
 * - `dismissPreDeployWarning` — append a warning id to `dismissedWarnings`
 *   ONLY when not already present (idempotent — the consumer doesn't have
 *   to track its own dispatch state).
 * - `acknowledgeCritical` — toggle the `criticalAcknowledged` flag.
 * - `resetPreDeployWarnings` — wipe both fields. Called automatically from
 *   `startPlanning` to reset between plans, and exposed as a manual escape
 *   hatch for the panel.
 *
 * @see rf-dslice-12
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeployState } from '../types';

export const preDeployReducers = {
  dismissPreDeployWarning: (state: DeployState, action: PayloadAction<string>) => {
    if (!state.dismissedWarnings.includes(action.payload)) {
      state.dismissedWarnings.push(action.payload);
    }
  },
  acknowledgeCritical: (state: DeployState, action: PayloadAction<boolean>) => {
    state.criticalAcknowledged = action.payload;
  },
  resetPreDeployWarnings: (state: DeployState) => {
    state.dismissedWarnings = [];
    state.criticalAcknowledged = false;
  },
} as const;
