/**
 * Flow Reporter — Generates structured JSON reports for Claude Code
 *
 * Each test flow produces a report file with:
 * - Steps taken and their outcomes
 * - Action log events (API calls, errors, state changes)
 * - Screenshots at each step
 * - GCP verification results
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Page } from '@playwright/test';
import { getActionLog, getErrors, type IceActionEvent } from './action-log-reader';

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
  apiCalls: { method: string; path: string; status: number; duration_ms: number }[];
  gcpVerifications?: { resource: string; exists: boolean; error?: string }[];
}

const REPORT_DIR = join(process.cwd(), 'test-results');

export class FlowReporter {
  private flow: string;
  private steps: FlowStep[] = [];
  private startedAt: string;
  private gcpVerifications: { resource: string; exists: boolean; error?: string }[] = [];

  constructor(flowName: string) {
    this.flow = flowName;
    this.startedAt = new Date().toISOString();
    mkdirSync(REPORT_DIR, { recursive: true });
  }

  /**
   * Record a test step.
   */
  async step(
    page: Page,
    name: string,
    action: string,
    fn: () => Promise<void>,
    selector?: string
  ): Promise<void> {
    const start = Date.now();
    const step: FlowStep = { name, action, selector, status: 'pass', duration_ms: 0 };

    try {
      await fn();
      step.duration_ms = Date.now() - start;

      // Take screenshot at each step
      const screenshotName = `${this.flow}-step-${this.steps.length + 1}-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
      const screenshotPath = join(REPORT_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath });
      step.screenshot = screenshotName;
    } catch (err: any) {
      step.status = 'fail';
      step.duration_ms = Date.now() - start;
      step.error = err.message;

      // Screenshot on failure too
      const screenshotName = `${this.flow}-FAIL-step-${this.steps.length + 1}.png`;
      const screenshotPath = join(REPORT_DIR, screenshotName);
      try {
        await page.screenshot({ path: screenshotPath });
        step.screenshot = screenshotName;
      } catch { /* ignore screenshot errors */ }

      this.steps.push(step);
      throw err;
    }

    this.steps.push(step);
  }

  /**
   * Record a GCP verification result.
   */
  addGcpVerification(resource: string, exists: boolean, error?: string): void {
    this.gcpVerifications.push({ resource, exists, error });
  }

  /**
   * Finalize and save the report.
   */
  async save(page: Page): Promise<string> {
    const actionLog = await getActionLog(page);
    const errors = await getErrors(page);

    const apiCalls = actionLog
      .filter((e) => e.action === 'api_response' || e.action === 'api_error')
      .map((e) => ({
        method: (e.detail.method as string) || 'GET',
        path: (e.detail.path as string) || e.target,
        status: (e.detail.status as number) || 0,
        duration_ms: e.duration_ms || 0,
      }));

    const report: FlowReport = {
      flow: this.flow,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      status: this.steps.some((s) => s.status === 'fail') ? 'fail' : 'pass',
      steps: this.steps,
      actionLog,
      errors,
      apiCalls,
      ...(this.gcpVerifications.length > 0 ? { gcpVerifications: this.gcpVerifications } : {}),
    };

    const reportPath = join(REPORT_DIR, `${this.flow}-report.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return reportPath;
  }
}
