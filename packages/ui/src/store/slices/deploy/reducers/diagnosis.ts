/**
 * Deploy slice — AI-Native #2 deploy-failure diagnosis reducers.
 *
 * Four reducers covering the diagnosis loading lifecycle. Each rebuilds
 * the entire `diagnosis` object so the consumer (deploy-diagnosis.tsx)
 * can rely on the four-arm shape (idle/loading/loaded/error) without
 * having to reason about partial updates.
 *
 * @see rf-dslice-11
 */

import type { DeployState } from '../types';
import type { PayloadAction } from '@reduxjs/toolkit';

export const diagnosisReducers = {
  startDiagnosis: (state: DeployState) => {
    state.diagnosis = { status: 'loading', result: null, error: null };
  },
  setDiagnosis: (state: DeployState, action: PayloadAction<{ diagnosis: string; suggestedFixes: string[] }>) => {
    state.diagnosis = { status: 'loaded', result: action.payload, error: null };
  },
  diagnosisError: (state: DeployState, action: PayloadAction<string>) => {
    state.diagnosis = { status: 'error', result: null, error: action.payload };
  },
  clearDiagnosis: (state: DeployState) => {
    state.diagnosis = { status: 'idle', result: null, error: null };
  },
} as const;
