/**
 * RunLogger — JSONL writer for deployment-test runs.
 *
 * One run = one directory under test-results/runs/<ts>-<scenarioId>/.
 * Events stream to events.jsonl (synchronous append; the test process is
 * the only writer). Final summary.json is written at end of run.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  EventBody,
  EventEnvelope,
  LogEvent,
  Phase,
  RunSummary,
} from './event-types';

export interface RunLoggerOpts {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  rootDir: string;
}

export class RunLogger {
  readonly runDir: string;
  readonly screenshotsDir: string;
  private readonly eventsFile: string;
  private seq = 0;
  private currentPhase: Phase | 'meta' = 'meta';
  private currentStep = 'init';
  private startedAt = Date.now();
  private finishedAt = 0;
  private phaseStarts = new Map<Phase, number>();
  private phaseResults: RunSummary['phases'] = [];
  private totals = { events: 0, errors: 0, recipeAttempts: 0, screenshots: 0 };
  private verifyResults: RunSummary['verifyResults'] = [];

  constructor(private readonly opts: RunLoggerOpts) {
    const { runId, scenarioId, rootDir } = opts;
    this.runDir = join(rootDir, `${runId}-${scenarioId}`);
    this.screenshotsDir = join(this.runDir, 'screenshots');
    this.eventsFile = join(this.runDir, 'events.jsonl');
    mkdirSync(this.screenshotsDir, { recursive: true });
  }

  setPhase(phase: Phase | 'meta'): void {
    this.currentPhase = phase;
  }

  setStep(step: string): void {
    this.currentStep = step;
  }

  emit(body: EventBody): void {
    const envelope: EventEnvelope = {
      ts: Date.now(),
      runId: this.opts.runId,
      scenarioId: this.opts.scenarioId,
      phase: this.currentPhase,
      step: this.currentStep,
      seq: this.seq++,
    };
    const event: LogEvent = { ...envelope, ...body } as LogEvent;
    appendFileSync(this.eventsFile, JSON.stringify(event) + '\n', 'utf-8');
    this.totals.events++;
    this.tally(body);
  }

  private tally(body: EventBody): void {
    switch (body.kind) {
      case 'screenshot':
        this.totals.screenshots++;
        break;
      case 'recipe_attempt':
        this.totals.recipeAttempts++;
        break;
      case 'api_error':
      case 'error_classified':
        this.totals.errors++;
        break;
      case 'phase_start':
        this.phaseStarts.set(body.phase, Date.now());
        break;
      case 'phase_end':
        this.phaseResults.push({
          phase: body.phase,
          status: body.status,
          durationMs: body.durationMs,
          error: body.error,
        });
        break;
      case 'gcloud_result':
        this.verifyResults.push({
          resourceKind: body.resourceKind,
          exists: body.exists,
          error: body.error,
        });
        break;
    }
  }

  startPhase(phase: Phase): void {
    this.setPhase(phase);
    this.setStep('start');
    this.emit({ kind: 'phase_start', phase });
  }

  endPhase(phase: Phase, status: 'pass' | 'fail' | 'skipped', error?: string): void {
    const startedAt = this.phaseStarts.get(phase) ?? Date.now();
    const durationMs = Date.now() - startedAt;
    this.emit({ kind: 'phase_end', phase, status, durationMs, error });
  }

  note(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    this.emit({ kind: 'note', message, level });
  }

  finalize(status: 'pass' | 'fail'): RunSummary {
    this.finishedAt = Date.now();
    const summary: RunSummary = {
      runId: this.opts.runId,
      scenarioId: this.opts.scenarioId,
      scenarioName: this.opts.scenarioName,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: this.finishedAt - this.startedAt,
      status,
      phases: this.phaseResults,
      totals: { ...this.totals },
      verifyResults: this.verifyResults,
      artifactsDir: this.runDir,
    };
    writeFileSync(join(this.runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    return summary;
  }

  writeDescription(markdown: string): void {
    writeFileSync(join(this.runDir, 'description.md'), markdown, 'utf-8');
  }

  writePreservedNotice(text: string): void {
    writeFileSync(join(this.runDir, 'PRESERVED.md'), text, 'utf-8');
  }

  /** Path for a screenshot file. Caller is responsible for actually saving. */
  screenshotPath(name: string): string {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.screenshotsDir, `${String(this.totals.screenshots).padStart(3, '0')}-${safe}.png`);
  }
}

/** Generate a runId based on the current timestamp. */
export function makeRunId(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
