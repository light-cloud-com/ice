/**
 * Deploy slice — deploy-phase entry reducers.
 *
 * Two reducers covering the start of the deploy and destroy phases.
 *
 * - `startDeploying` — flip status to 'deploying'. **LOAD-BEARING guard**:
 *   no-op when status is already `'deploying' | 'planning' | 'destroying'`.
 *   The socket subscription hook dispatches this blindly and we deduplicate
 *   here. Destroy events share the progress channel and would otherwise
 *   stomp the destroying label.
 *
 * - `startDestroying` — flip status to 'destroying'. **LOAD-BEARING guard**:
 *   no-op when status is already 'destroying' (no other early-return shapes).
 *
 * Both reset `results` / `nodesById` / `error`, and stamp
 * `currentDeployCardId` from the (optional) payload.
 *
 * @see rf-dslice-6
 */

import { t } from '../../../../i18n';
import type { DeployState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const deployPhasesReducers = {
  startDeploying: (state: DeployState, action: PayloadAction<{ cardId?: string } | undefined>) => {
    // Idempotent: a no-op if a deploy/destroy is already in flight.
    // Used both by the user-initiated path (Plan → Deploy click) and
    // by the socket subscription hook when an externally-triggered
    // deploy (e.g. GitHub push webhook) starts streaming events. The
    // subscription hook can't tell whether the slice is already in a
    // deploy state, so it dispatches blindly and we deduplicate here.
    // Also a no-op when destroying — destroy events use the same
    // progress channel and would otherwise stomp the destroying label.
    if (state.status === 'deploying' || state.status === 'planning' || state.status === 'destroying') return;
    state.status = 'deploying';
    state.results = [];
    state.nodesById = {};
    state.error = null;
    state.currentDeployCardId = action?.payload?.cardId ?? state.currentDeployCardId;
    state.logs.push(t('deploy.slice.deploying'));
  },
  startDestroying: (state: DeployState, action: PayloadAction<{ cardId?: string } | undefined>) => {
    // Tear-down counterpart to startDeploying. Sets the slice into
    // a 'destroying' state so the StatusBadge + UI labels reflect
    // the operation. The subscription hook checks for this state
    // before flipping back to 'deploying' on incoming progress events.
    if (state.status === 'destroying') return;
    state.status = 'destroying';
    state.results = [];
    state.nodesById = {};
    state.error = null;
    state.currentDeployCardId = action?.payload?.cardId ?? state.currentDeployCardId;
    state.logs.push('Destroying deployment...');
  },
} as const;
