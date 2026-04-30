/**
 * Deploy slice — planning reducers.
 *
 * Two reducers covering the plan phase:
 *
 * - `startPlanning` — flip status to 'planning', clear error and plan,
 *   reset logs, and reset per-plan UI state (dismissedWarnings,
 *   criticalAcknowledged) for AI-Native #3.
 *
 * - `setPlan` — normalize the incoming plan shape (backend may omit
 *   updates/deletes or send numbers instead of arrays in older responses)
 *   so downstream consumers always see arrays. Flip status to 'planned'.
 *   The 5 `Array.isArray(raw.X) ? raw.X : []` checks are LOAD-BEARING —
 *   removing any of them risks a `cannot read length of undefined` in the
 *   plan preview. Pinned by tests.
 *
 * @see rf-dslice-5
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeployPlan, DeployState } from '../types';
import { t } from '../../../../i18n';

export const planningReducers = {
  startPlanning: (state: DeployState) => {
    state.status = 'planning';
    state.error = null;
    state.plan = null;
    state.logs = [t('deploy.slice.planning')];
    // Reset per-plan UI state (AI-Native #3)
    state.dismissedWarnings = [];
    state.criticalAcknowledged = false;
  },
  setPlan: (state: DeployState, action: PayloadAction<DeployPlan>) => {
    // Normalize plan shape — backend may omit updates/deletes or send numbers
    // instead of arrays in older responses. Guarantee arrays downstream.
    const raw = (action.payload || {}) as Partial<DeployPlan>;
    const normalized: DeployPlan = {
      creates: Array.isArray(raw.creates) ? raw.creates : [],
      updates: Array.isArray(raw.updates) ? raw.updates : [],
      deletes: Array.isArray(raw.deletes) ? raw.deletes : [],
      skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    };
    state.status = 'planned';
    state.plan = normalized;
    state.logs.push(
      t('deploy.slice.planReady', {
        creates: normalized.creates.length,
        updates: normalized.updates.length,
        deletes: normalized.deletes.length,
      }),
    );
  },
} as const;
