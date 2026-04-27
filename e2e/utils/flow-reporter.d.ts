/**
 * Flow Reporter — Generates structured JSON reports for Claude Code
 *
 * Each test flow produces a report file with:
 * - Steps taken and their outcomes
 * - Action log events (API calls, errors, state changes)
 * - Screenshots at each step
 * - GCP verification results
 */
import type { Page } from '@playwright/test';
import { type IceActionEvent } from './action-log-reader';
export interface FlowStep {
    name: string;
    action: string;
    selector?: string;
    status: 'pass' | 'fail' | 'skip';
    duration_ms: number;
    screenshot?: string;
    error?: string;
}
export interface FlowReport {
    flow: string;
    startedAt: string;
    completedAt: string;
    status: 'pass' | 'fail';
    steps: FlowStep[];
    actionLog: IceActionEvent[];
    errors: IceActionEvent[];
    apiCalls: {
        method: string;
        path: string;
        status: number;
        duration_ms: number;
    }[];
    gcpVerifications?: {
        resource: string;
        exists: boolean;
        error?: string;
    }[];
}
export declare class FlowReporter {
    private flow;
    private steps;
    private startedAt;
    private gcpVerifications;
    constructor(flowName: string);
    /**
     * Record a test step.
     */
    step(page: Page, name: string, action: string, fn: () => Promise<void>, selector?: string): Promise<void>;
    /**
     * Record a GCP verification result.
     */
    addGcpVerification(resource: string, exists: boolean, error?: string): void;
    /**
     * Finalize and save the report.
     */
    save(page: Page): Promise<string>;
}
