/**
 * RunLogger — JSONL writer for deployment-test runs.
 *
 * One run = one directory under test-results/runs/<ts>-<scenarioId>/.
 * Events stream to events.jsonl (synchronous append; the test process is
 * the only writer). Final summary.json is written at end of run.
 */
import type { EventBody, Phase, RunSummary } from './event-types';
export interface RunLoggerOpts {
    runId: string;
    scenarioId: string;
    scenarioName: string;
    rootDir: string;
}
export declare class RunLogger {
    private readonly opts;
    readonly runDir: string;
    readonly screenshotsDir: string;
    private readonly eventsFile;
    private seq;
    private currentPhase;
    private currentStep;
    private startedAt;
    private finishedAt;
    private phaseStarts;
    private phaseResults;
    private totals;
    private verifyResults;
    constructor(opts: RunLoggerOpts);
    setPhase(phase: Phase | 'meta'): void;
    setStep(step: string): void;
    emit(body: EventBody): void;
    private tally;
    startPhase(phase: Phase): void;
    endPhase(phase: Phase, status: 'pass' | 'fail' | 'skipped', error?: string): void;
    note(message: string, level?: 'info' | 'warn' | 'error'): void;
    finalize(status: 'pass' | 'fail'): RunSummary;
    writeDescription(markdown: string): void;
    writePreservedNotice(text: string): void;
    /** Path for a screenshot file. Caller is responsible for actually saving. */
    screenshotPath(name: string): string;
}
/** Generate a runId based on the current timestamp. */
export declare function makeRunId(): string;
