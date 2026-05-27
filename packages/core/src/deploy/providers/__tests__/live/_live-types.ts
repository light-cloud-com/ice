/**
 * Live-test event types.
 *
 * Tests append one of these per provider operation to a JSONL file under
 * `e2e/<provider>-deployment-tests/runs/<runId>.jsonl`. Backs the deploy-gate
 * audit trail referenced in `inprogress/progress.md` → Deploy verification log.
 */

import type { ResourceDeployResult } from '../../../types';

export type LiveProvider = 'aws' | 'azure';

export interface RunStartEvent {
  kind: 'run-start';
  runId: string;
  provider: LiveProvider;
  region?: string;
  subscription?: string;
  ts: string;
}

export interface CreateEvent {
  kind: 'create';
  runId: string;
  handler: string;
  result: ResourceDeployResult;
  ts: string;
}

export interface UpdateEvent {
  kind: 'update';
  runId: string;
  handler: string;
  result: ResourceDeployResult;
  ts: string;
}

export interface DeleteEvent {
  kind: 'delete';
  runId: string;
  handler: string;
  result: ResourceDeployResult;
  ts: string;
}

export interface RunEndEvent {
  kind: 'run-end';
  runId: string;
  stats: { created: number; updated: number; deleted: number; failed: number };
  ts: string;
}

export type LiveEvent = RunStartEvent | CreateEvent | UpdateEvent | DeleteEvent | RunEndEvent;

/** Shape callers pass to JsonlLogger.log — runId + ts are filled in automatically. */
export type LiveEventInput =
  | Omit<RunStartEvent, 'runId' | 'ts'>
  | Omit<CreateEvent, 'runId' | 'ts'>
  | Omit<UpdateEvent, 'runId' | 'ts'>
  | Omit<DeleteEvent, 'runId' | 'ts'>
  | Omit<RunEndEvent, 'runId' | 'ts'>;
