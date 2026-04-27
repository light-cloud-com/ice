/**
 * Scenario runner — orchestrates the six phases for a single scenario.
 *
 * Failure of any phase short-circuits later phases (except cleanup, which
 * always runs in preserve mode). Each phase emits its own phase_start and
 * phase_end events to the JSONL log.
 */
import type { Page } from '@playwright/test';
import type { TemplateDeployHelper } from '../fixtures/template-deploy.fixture';
import type { Scenario } from './schema';
export interface RunOptions {
    page: Page;
    fixture: TemplateDeployHelper;
    scenario: Scenario;
    rootDir: string;
    runId?: string;
}
export declare function runScenario(opts: RunOptions): Promise<{
    status: 'pass' | 'fail';
    summaryPath: string;
    runDir: string;
}>;
