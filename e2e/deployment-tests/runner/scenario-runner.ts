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
import { CanvasUI } from './ui-helpers/canvas';
import { PropertiesUI } from './ui-helpers/properties';
import { RunLogger, makeRunId } from './logger/run-logger';
import type { RunContext } from './context';
import { runSetup } from './phases/setup';
import { runDescribe } from './phases/describe';
import { runDesign } from './phases/design';
import { runDeploy } from './phases/deploy';
import { runVerify } from './phases/verify';
import { runCleanup } from './phases/cleanup';
import { renderRunReport } from './reporter/html-report';
import type { Phase } from './logger/event-types';

export interface RunOptions {
  page: Page;
  fixture: TemplateDeployHelper;
  scenario: Scenario;
  rootDir: string;
  runId?: string;
}

const PIPELINE: Array<{ phase: Phase; fn: (ctx: RunContext) => Promise<{ status: 'pass' | 'fail' | 'skipped'; error?: string }> }> = [
  { phase: 'setup', fn: runSetup },
  { phase: 'describe', fn: runDescribe },
  { phase: 'design', fn: runDesign },
  { phase: 'deploy', fn: runDeploy },
  { phase: 'verify', fn: runVerify },
];

export async function runScenario(opts: RunOptions): Promise<{
  status: 'pass' | 'fail';
  summaryPath: string;
  runDir: string;
}> {
  const runId = opts.runId ?? makeRunId();
  const logger = new RunLogger({
    runId,
    scenarioId: opts.scenario.id,
    scenarioName: opts.scenario.name,
    rootDir: opts.rootDir,
  });

  const canvas = new CanvasUI(opts.page, logger);
  const props = new PropertiesUI(opts.page, logger);

  const ctx: RunContext = {
    page: opts.page,
    scenario: opts.scenario,
    fixture: opts.fixture,
    canvas,
    props,
    logger,
    nodeIdByAlias: new Map(),
  };

  let overall: 'pass' | 'fail' = 'pass';
  for (const step of PIPELINE) {
    logger.startPhase(step.phase);
    const result = await step.fn(ctx);
    logger.endPhase(step.phase, result.status, result.error);
    if (result.status === 'fail') {
      overall = 'fail';
      logger.note(`Phase ${step.phase} failed: ${result.error}`, 'error');
      break;
    }
  }

  // Cleanup always runs.
  logger.startPhase('cleanup');
  const cleanupResult = await runCleanup(ctx, overall);
  logger.endPhase('cleanup', cleanupResult.status, cleanupResult.error);

  logger.finalize(overall);
  try {
    renderRunReport(logger.runDir);
  } catch (err) {
    logger.note(`HTML report failed: ${err instanceof Error ? err.message : String(err)}`, 'warn');
  }
  return {
    status: overall,
    summaryPath: `${logger.runDir}/summary.json`,
    runDir: logger.runDir,
  };
}
