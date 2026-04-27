/**
 * Deployment-test event types.
 *
 * Every line in events.jsonl is one of these. Discriminated union by `kind`.
 *
 * Common envelope fields are applied by RunLogger (ts, runId, scenarioId,
 * phase, step, seq) — callers only supply `kind` + payload.
 */

import type { ClassifiedError, ErrorCategory } from '../../../utils/error-classifier';

export type Phase = 'setup' | 'describe' | 'design' | 'deploy' | 'verify' | 'cleanup';

export interface EventEnvelope {
  ts: number;
  runId: string;
  scenarioId: string;
  phase: Phase | 'meta';
  step: string;
  seq: number;
}

// ─── Phase events ──────────────────────────────────────────────────────────

export interface PhaseStartEvent {
  kind: 'phase_start';
  phase: Phase;
}

export interface PhaseEndEvent {
  kind: 'phase_end';
  phase: Phase;
  status: 'pass' | 'fail' | 'skipped';
  durationMs: number;
  error?: string;
}

// ─── UI / screenshot events ────────────────────────────────────────────────

export type UiAction = 'click' | 'fill' | 'drag' | 'select' | 'keyboard' | 'navigate' | 'wait';

export interface UiActionEvent {
  kind: 'ui_action';
  action: UiAction;
  selector?: string;
  args?: Record<string, unknown>;
}

export interface ScreenshotEvent {
  kind: 'screenshot';
  path: string;
  reason?: string;
}

// ─── Mirrored ICE action-log events ────────────────────────────────────────

export interface ApiCallEvent {
  kind: 'api_call';
  target: string;
  detail?: Record<string, unknown>;
  appSeq: number;
}

export interface ApiResponseEvent {
  kind: 'api_response';
  target: string;
  status: number;
  detail?: Record<string, unknown>;
  appSeq: number;
  durationMs?: number;
}

export interface ApiErrorEvent {
  kind: 'api_error';
  target: string;
  status?: number;
  detail?: Record<string, unknown>;
  appSeq: number;
}

// ─── Error / recipe events ─────────────────────────────────────────────────

export interface ErrorClassifiedEvent {
  kind: 'error_classified';
  classified: ClassifiedError;
  raw: string;
}

export interface RecipeAttemptEvent {
  kind: 'recipe_attempt';
  recipe: string;
  category: ErrorCategory;
  attempt: number;
}

export interface RecipeResultEvent {
  kind: 'recipe_result';
  recipe: string;
  attempt: number;
  status: 'fixed' | 'needs-human' | 'abandoned';
  notes: string[];
}

// ─── Verification events ───────────────────────────────────────────────────

export interface GcloudCheckEvent {
  kind: 'gcloud_check';
  resourceKind: string;
  params: Record<string, unknown>;
}

export interface GcloudResultEvent {
  kind: 'gcloud_result';
  resourceKind: string;
  exists: boolean;
  resource?: unknown;
  error?: string;
}

// ─── Misc ──────────────────────────────────────────────────────────────────

export interface NoteEvent {
  kind: 'note';
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export interface WaitForHumanEvent {
  kind: 'wait_for_human';
  reason: string;
  resumeUrl?: string;
}

export interface DeployLogTailEvent {
  kind: 'deploy_log_tail';
  text: string;
}

// ─── Union ─────────────────────────────────────────────────────────────────

export type EventBody =
  | PhaseStartEvent
  | PhaseEndEvent
  | UiActionEvent
  | ScreenshotEvent
  | ApiCallEvent
  | ApiResponseEvent
  | ApiErrorEvent
  | ErrorClassifiedEvent
  | RecipeAttemptEvent
  | RecipeResultEvent
  | GcloudCheckEvent
  | GcloudResultEvent
  | NoteEvent
  | WaitForHumanEvent
  | DeployLogTailEvent;

export type LogEvent = EventEnvelope & EventBody;

// ─── Summary ──────────────────────────────────────────────────────────────

export interface RunSummary {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: 'pass' | 'fail';
  phases: Array<{
    phase: Phase;
    status: 'pass' | 'fail' | 'skipped';
    durationMs: number;
    error?: string;
  }>;
  totals: {
    events: number;
    errors: number;
    recipeAttempts: number;
    screenshots: number;
  };
  verifyResults: Array<{
    resourceKind: string;
    exists: boolean;
    error?: string;
  }>;
  artifactsDir: string;
}
