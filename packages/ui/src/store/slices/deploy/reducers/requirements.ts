/**
 * Deploy slice — Phase 8 block-requirements reducers.
 *
 * Four reducers covering the resolved-requirements list (DNS verification,
 * cert issuance, custom-domain verification, etc.).
 *
 * - `startRequirementsFetch` — flip the loading flag.
 * - `setRequirements` — replace the list, stamp `requirementsFetchedAt`,
 *   turn off loading.
 * - `updateRequirement` — splice or push by `(definitionId, nodeId)`.
 *   Composite key — both fields together identify a row, since the same
 *   requirement (e.g. domain-verified) can apply to multiple blocks.
 * - `clearRequirements` — reset all three fields back to defaults.
 *
 * @see rf-dslice-10
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeployState, ResolvedRequirementState } from '../types';

export const requirementsReducers = {
  startRequirementsFetch: (state: DeployState) => {
    state.requirementsLoading = true;
  },
  setRequirements: (state: DeployState, action: PayloadAction<ResolvedRequirementState[]>) => {
    state.requirements = action.payload;
    state.requirementsLoading = false;
    state.requirementsFetchedAt = new Date().toISOString();
  },
  updateRequirement: (state: DeployState, action: PayloadAction<ResolvedRequirementState>) => {
    const idx = state.requirements.findIndex(
      (r) => r.definitionId === action.payload.definitionId && r.nodeId === action.payload.nodeId,
    );
    if (idx >= 0) {
      state.requirements[idx] = action.payload;
    } else {
      state.requirements.push(action.payload);
    }
  },
  clearRequirements: (state: DeployState) => {
    state.requirements = [];
    state.requirementsLoading = false;
    state.requirementsFetchedAt = undefined;
  },
} as const;
