/**
 * Validation Slice
 *
 * Stores canvas validation results and provides selectors for
 * node-level and edge-level issue lookups.
 *
 * Validation runs on a debounced timer after canvas changes.
 * The actual validateCanvas() call happens in the useCanvasValidation hook.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ─── Types (mirrored from @ice/core/validation to avoid cross-module issues) ─

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueCategory = 'property' | 'connection' | 'structure' | 'deploy' | 'architecture';

export interface CanvasIssue {
  readonly id: string;
  readonly severity: IssueSeverity;
  readonly category: IssueCategory;
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
  readonly edgeId?: string;
  readonly propertyPath?: string;
  readonly suggestion?: string;
}

export interface ValidationSummary {
  errors: number;
  warnings: number;
  info: number;
}

// ─── Slice State ────────────────────────────────────────────────────────────

export interface ValidationState {
  /** All issues from the last validation run */
  issues: CanvasIssue[];
  /** Whether validation passed (no errors) */
  valid: boolean;
  /** Whether the canvas is deployable (no errors, no deploy-blocking issues) */
  deployable: boolean;
  /** Counts by severity */
  summary: ValidationSummary;
  /** ISO timestamp of last validation */
  validatedAt: string | null;
  /** Whether validation is currently running (for UI feedback) */
  isValidating: boolean;
}

const initialState: ValidationState = {
  issues: [],
  valid: true,
  deployable: true,
  summary: { errors: 0, warnings: 0, info: 0 },
  validatedAt: null,
  isValidating: false,
};

// ─── Slice ──────────────────────────────────────────────────────────────────

const validationSlice = createSlice({
  name: 'validation',
  initialState,
  reducers: {
    setValidationResult(
      state,
      action: PayloadAction<{
        issues: CanvasIssue[];
        valid: boolean;
        deployable: boolean;
        summary: ValidationSummary;
        validatedAt: string;
      }>,
    ) {
      const { issues, valid, deployable, summary, validatedAt } = action.payload;
      state.issues = issues;
      state.valid = valid;
      state.deployable = deployable;
      state.summary = summary;
      state.validatedAt = validatedAt;
      state.isValidating = false;
    },

    setValidating(state, action: PayloadAction<boolean>) {
      state.isValidating = action.payload;
    },

    clearValidation(state) {
      state.issues = [];
      state.valid = true;
      state.deployable = true;
      state.summary = { errors: 0, warnings: 0, info: 0 };
      state.validatedAt = null;
      state.isValidating = false;
    },
  },
});

export const { setValidationResult, setValidating, clearValidation } = validationSlice.actions;
export default validationSlice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────────

type RootState = { validation: ValidationState };

/** All issues */
export const selectValidationIssues = (state: RootState) => state.validation.issues;

/** Whether the canvas is valid (no errors) */
export const selectIsValid = (state: RootState) => state.validation.valid;

/** Whether the canvas is deployable */
export const selectIsDeployable = (state: RootState) => state.validation.deployable;

/** Summary counts */
export const selectValidationSummary = (state: RootState) => state.validation.summary;

/** Issues for a specific node */
export const selectNodeIssues = (state: RootState, nodeId: string) =>
  state.validation.issues.filter((i) => i.nodeId === nodeId);

/** Issues for a specific edge */
export const selectEdgeIssues = (state: RootState, edgeId: string) =>
  state.validation.issues.filter((i) => i.edgeId === edgeId);

/** Highest severity for a specific node ('error' > 'warning' > 'info' > null) */
export const selectNodeSeverity = (state: RootState, nodeId: string): IssueSeverity | null => {
  const nodeIssues = state.validation.issues.filter((i) => i.nodeId === nodeId);
  if (nodeIssues.some((i) => i.severity === 'error')) return 'error';
  if (nodeIssues.some((i) => i.severity === 'warning')) return 'warning';
  if (nodeIssues.some((i) => i.severity === 'info')) return 'info';
  return null;
};

/** Property-specific issues for a node */
export const selectPropertyIssues = (state: RootState, nodeId: string, propertyPath: string) =>
  state.validation.issues.filter((i) => i.nodeId === nodeId && i.propertyPath === propertyPath);

/** Whether validation is in progress */
export const selectIsValidating = (state: RootState) => state.validation.isValidating;
