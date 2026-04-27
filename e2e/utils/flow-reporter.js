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
import { getActionLog, getErrors } from './action-log-reader';
const REPORT_DIR = join(process.cwd(), 'test-results');
export class FlowReporter {
    flow;
    steps = [];
    startedAt;
    gcpVerifications = [];
    constructor(flowName) {
        this.flow = flowName;
        this.startedAt = new Date().toISOString();
        mkdirSync(REPORT_DIR, { recursive: true });
    }
    /**
     * Record a test step.
     */
    async step(page, name, action, fn, selector) {
        const start = Date.now();
        const step = { name, action, selector, status: 'pass', duration_ms: 0 };
        try {
            await fn();
            step.duration_ms = Date.now() - start;
            // Take screenshot at each step
            const screenshotName = `${this.flow}-step-${this.steps.length + 1}-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
            const screenshotPath = join(REPORT_DIR, screenshotName);
            await page.screenshot({ path: screenshotPath });
            step.screenshot = screenshotName;
        }
        catch (err) {
            step.status = 'fail';
            step.duration_ms = Date.now() - start;
            step.error = err.message;
            // Screenshot on failure too
            const screenshotName = `${this.flow}-FAIL-step-${this.steps.length + 1}.png`;
            const screenshotPath = join(REPORT_DIR, screenshotName);
            try {
                await page.screenshot({ path: screenshotPath });
                step.screenshot = screenshotName;
            }
            catch {
                /* ignore screenshot errors */
            }
            this.steps.push(step);
            throw err;
        }
        this.steps.push(step);
    }
    /**
     * Record a GCP verification result.
     */
    addGcpVerification(resource, exists, error) {
        this.gcpVerifications.push({ resource, exists, error });
    }
    /**
     * Finalize and save the report.
     */
    async save(page) {
        const actionLog = await getActionLog(page);
        const errors = await getErrors(page);
        const apiCalls = actionLog
            .filter((e) => e.action === 'api_response' || e.action === 'api_error')
            .map((e) => ({
            method: e.detail.method || 'GET',
            path: e.detail.path || e.target,
            status: e.detail.status || 0,
            duration_ms: e.duration_ms || 0,
        }));
        const report = {
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
