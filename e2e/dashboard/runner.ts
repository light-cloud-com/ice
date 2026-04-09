/**
 * Test Runner — Spawns/kills Playwright test process
 *
 * Manages the lifecycle of a test run, reading progress from the
 * progress.json file written by the test suite.
 */

import { spawn, type ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ProgressState } from '../utils/live-progress';

const OUTPUT_DIR = 'test-results/gcp';
const PROGRESS_FILE = join(OUTPUT_DIR, 'progress.json');

export class TestRunner {
  private process: ChildProcess | null = null;
  private _status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped' = 'idle';
  private _output: string[] = [];
  private _startedAt: string = '';
  private _error: string = '';
  private _config: { templates: string[]; project: string; region: string } | null = null;

  get status() {
    return this._status;
  }

  get isRunning() {
    return this._status === 'running';
  }

  /**
   * Check if the ICE backend + frontend are running (required for Playwright tests).
   */
  async preflight(): Promise<{ ok: boolean; backend: boolean; frontend: boolean; frontendPort?: number; error?: string }> {
    let backend = false;
    let frontend = false;
    let frontendPort: number | undefined;

    // Check backend (gateway)
    for (const port of [5001, 5002]) {
      try {
        const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) { backend = true; break; }
      } catch {}
    }

    // Check frontend (Vite) — try 5174 first, then 5174
    for (const port of [5174, 5174]) {
      try {
        const res = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok || res.status < 500) {
          frontend = true;
          frontendPort = port;
          break;
        }
      } catch {}
    }

    if (!backend && !frontend) {
      return { ok: false, backend, frontend, error: 'ICE backend and frontend are not running. Start them first:\n  pnpm dev:all' };
    }
    if (!backend) {
      return { ok: false, backend, frontend, frontendPort, error: 'ICE backend not running on port 5001/5002. Start it:\n  pnpm dev:gateway' };
    }
    if (!frontend) {
      return { ok: false, backend, frontend, error: 'ICE frontend not running on port 5174. Start it:\n  pnpm dev:web' };
    }
    if (frontendPort !== 5174) {
      return { ok: false, backend, frontend, frontendPort, error: `Frontend is on port ${frontendPort} but Playwright expects 5174. Restart with:\n  pnpm dev:web -- --port 5174\nOr kill whatever is using port 5174.` };
    }
    return { ok: true, backend, frontend, frontendPort };
  }

  /**
   * Start a test run with selected templates.
   */
  async start(config: {
    templates: string[];
    project: string;
    region: string;
    saKeyPath: string;
    githubToken?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: 'A test run is already in progress' };
    }

    // Validate SA key file exists
    if (!existsSync(config.saKeyPath)) {
      return { success: false, error: `SA key file not found: ${config.saKeyPath}` };
    }

    // Pre-flight: check backend + frontend are running
    const preflight = await this.preflight();
    if (!preflight.ok) {
      return { success: false, error: preflight.error };
    }

    this._status = 'running';
    this._output = [];
    this._error = '';
    this._startedAt = new Date().toISOString();
    this._config = { templates: config.templates, project: config.project, region: config.region };

    // Ensure output dir exists
    mkdirSync(OUTPUT_DIR, { recursive: true });

    this.log(`Starting test run: ${config.templates.length} template(s)`);
    this.log(`Project: ${config.project}, Region: ${config.region}`);
    this.log(`Templates: ${config.templates.join(', ')}`);
    this.log('---');

    const env = {
      ...process.env,
      ICE_TEST_TEMPLATES: config.templates.join(','),
      ICE_TEST_GCP_PROJECT: config.project,
      ICE_TEST_GCP_REGION: config.region,
      ICE_TEST_SA_KEY_PATH: config.saKeyPath,
      ...(config.githubToken ? { ICE_TEST_GITHUB_TOKEN: config.githubToken } : {}),
    };

    try {
      this.process = spawn(
        'pnpm',
        ['exec', 'playwright', 'test', '--config', 'e2e/playwright.config.ts', '--project=gcp-integration'],
        {
          env,
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
        },
      );
    } catch (err: any) {
      this._status = 'failed';
      this._error = `Failed to spawn process: ${err.message}`;
      this.log(`ERROR: ${this._error}`);
      return { success: false, error: this._error };
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        // Skip the live-progress terminal table (noisy in dashboard)
        if (line.includes('────') || line.includes('GCP Template Tests —') || line.match(/^\s*(OK|XX|>>|--|  )\s/)) continue;
        this.log(line);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        // Skip npm warnings and WebServer noise
        if (line.includes('npm warn') || line.includes('[WebServer]')) continue;
        this.log(line);
      }
    });

    this.process.on('close', (code) => {
      this._status = code === 0 ? 'completed' : 'failed';
      this.log(`---`);
      this.log(`Process exited with code ${code}`);
      if (code !== 0) {
        this._error = `Playwright exited with code ${code}`;
      }
      this.process = null;
      // Always write a fallback report so /api/report/html has something to show
      this.writeFallbackReport(code || 1);
    });

    this.process.on('error', (err) => {
      this._status = 'failed';
      this._error = `Process error: ${err.message}`;
      this.log(`ERROR: ${this._error}`);
      this.process = null;
    });

    return { success: true };
  }

  /**
   * Stop the current test run.
   */
  stop(): { success: boolean } {
    if (!this.process) return { success: false };
    this.log('Stopping test run...');
    this.process.kill('SIGTERM');
    this._status = 'stopped';
    return { success: true };
  }

  /**
   * Read current progress from progress.json.
   */
  getProgress(): ProgressState | null {
    if (!existsSync(PROGRESS_FILE)) return null;
    try {
      const raw = readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Get full status including output, error, config.
   */
  getFullStatus() {
    return {
      status: this._status,
      startedAt: this._startedAt,
      error: this._error,
      config: this._config,
      outputLineCount: this._output.length,
      progress: this.getProgress(),
    };
  }

  /**
   * Get process output (last N lines).
   */
  getOutput(limit = 200): string[] {
    return this._output.slice(-limit);
  }

  /**
   * Get latest report path.
   */
  getLatestReportPath(): string | null {
    const jsonPath = join(OUTPUT_DIR, 'latest-report.json');
    return existsSync(jsonPath) ? jsonPath : null;
  }

  /**
   * Write a fallback HTML report from captured output when no formal report was generated.
   */
  private writeFallbackReport(exitCode: number) {
    const latestHtml = join(OUTPUT_DIR, 'latest-report.html');
    const latestJson = join(OUTPUT_DIR, 'latest-report.json');

    // Don't overwrite a real report that was generated during the run
    if (existsSync(latestJson)) {
      try {
        const data = JSON.parse(readFileSync(latestJson, 'utf-8'));
        if (data.templates?.length > 0) return; // real report exists
      } catch {}
    }

    const status = exitCode === 0 ? 'completed' : 'failed';
    const outputHtml = this._output
      .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('\n');

    // Extract errors from output
    const errorLines = this._output.filter(
      (l) => l.includes('Error:') || l.includes('error') || l.includes('FAIL') || l.includes('✘'),
    );

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>ICE GCP Test Report</title>
<style>
:root{--bg:#0b0d14;--surface:#151823;--border:#262a3a;--text:#e8eaf0;--dim:#7c819a;--fail:#f87171;--pass:#34d399;--accent:#6366f1}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;padding:32px}
.container{max-width:900px;margin:0 auto}
h1{font-size:20px;margin-bottom:8px}
.status{display:inline-block;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:700;margin-bottom:16px}
.status.failed{background:rgba(248,113,113,.12);color:var(--fail)}
.status.completed{background:rgba(52,211,153,.12);color:var(--pass)}
.meta{color:var(--dim);font-size:13px;margin-bottom:24px}
h2{font-size:16px;margin:24px 0 8px}
.log{background:#080a10;border:1px solid var(--border);border-radius:10px;padding:16px;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:11px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--dim);max-height:600px;overflow-y:auto}
.error-box{background:rgba(248,113,113,.05);border:1px solid rgba(248,113,113,.15);border-radius:10px;padding:16px;margin-bottom:8px;font-size:13px;color:var(--fail);font-family:'SF Mono',Monaco,Consolas,monospace;white-space:pre-wrap}
</style></head><body>
<div class="container">
<h1>ICE GCP Test Report</h1>
<div class="status ${status}">${status === 'failed' ? 'FAILED' : 'COMPLETED'}</div>
<div class="meta">
  Project: <strong>${this._config?.project || 'n/a'}</strong> &middot;
  Region: <strong>${this._config?.region || 'n/a'}</strong> &middot;
  Templates: <strong>${this._config?.templates?.join(', ') || 'n/a'}</strong> &middot;
  Started: ${this._startedAt} &middot;
  Exit code: ${exitCode}
</div>
${errorLines.length > 0 ? `<h2>Errors</h2>${errorLines.map((l) => `<div class="error-box">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`).join('\n')}` : ''}
<h2>Full Output</h2>
<div class="log">${outputHtml}</div>
</div></body></html>`;

    writeFileSync(latestHtml, html);

    const json = {
      runId: `gcp-test-${this._startedAt}`,
      startedAt: this._startedAt,
      completedAt: new Date().toISOString(),
      status,
      exitCode,
      config: this._config,
      output: this._output,
      errors: errorLines,
      templates: [],
    };
    writeFileSync(latestJson, JSON.stringify(json, null, 2));
  }

  private log(msg: string) {
    // Strip ANSI escape codes
    const clean = msg.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\[2m|\[22m/g, '');
    if (!clean.trim()) return; // skip blank lines

    const ts = new Date().toISOString().slice(11, 19);
    this._output.push(`[${ts}] ${clean}`);
    // Keep last 500 lines
    if (this._output.length > 500) this._output = this._output.slice(-500);
    // Also print to dashboard server console
    console.log(`  [runner] ${clean}`);
  }
}
