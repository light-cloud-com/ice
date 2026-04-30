/**
 * Deploy slice — authentication reducers.
 *
 * Three reducers covering the auth phase before plan/deploy. Spread into
 * `createSlice`'s `reducers` block in the orchestrator (`deploy-slice.ts`)
 * so RTK still owns the action type strings (`'deploy/startAuthenticating'`
 * etc.).
 *
 * - `startAuthenticating` — flip status to 'authenticating', clear error,
 *   reset logs to a single "connecting" entry (i18n).
 * - `authSuccess` — flip status back to 'idle' and append a log entry.
 * - `authFailed` — flip status to 'error', store the message, append a log.
 *
 * @see rf-dslice-4
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeployState } from '../types';
import { t } from '../../../../i18n';

export const authReducers = {
  startAuthenticating: (state: DeployState) => {
    state.status = 'authenticating';
    state.error = null;
    state.logs = [t('deploy.slice.connecting')];
  },
  authSuccess: (state: DeployState) => {
    state.status = 'idle';
    state.logs.push(t('deploy.slice.authSuccess'));
  },
  authFailed: (state: DeployState, action: PayloadAction<string>) => {
    state.status = 'error';
    state.error = action.payload;
    state.logs.push(t('deploy.slice.authFailed', { error: action.payload }));
  },
} as const;
