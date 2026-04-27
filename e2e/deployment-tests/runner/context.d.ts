/**
 * RunContext — shared state across phases for one scenario run.
 */
import type { Page } from '@playwright/test';
import type { TemplateDeployHelper } from '../../fixtures/template-deploy.fixture';
import type { Scenario } from './schema';
import type { CanvasUI } from './ui-helpers/canvas';
import type { PropertiesUI } from './ui-helpers/properties';
import type { RunLogger } from './logger/run-logger';
export interface RunContext {
    page: Page;
    scenario: Scenario;
    fixture: TemplateDeployHelper;
    canvas: CanvasUI;
    props: PropertiesUI;
    logger: RunLogger;
    /** node-alias (from scenario) → live data-node-id on the canvas. */
    nodeIdByAlias: Map<string, string>;
    /** apply() result, populated after deploy phase. */
    applyResult?: {
        success: boolean;
        result?: any;
        logs: string[];
        error?: string;
    };
}
export type PhaseStatus = 'pass' | 'fail' | 'skipped';
export interface PhaseResult {
    status: PhaseStatus;
    error?: string;
}
