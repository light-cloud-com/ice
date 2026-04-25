/**
 * Template Test Reporter — HTML + JSON aggregate report generator
 *
 * Takes TemplateDeployRecord[] from all tested templates and produces:
 * - JSON report with full data
 * - Self-contained HTML report with interactive sections
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TemplateDeployRecord, ResourceVerification } from './deploy-log-collector';
import type { ClassifiedError, ErrorCategory } from './error-classifier';
import { summarizeErrors } from './error-classifier';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TestRunReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  duration_ms: number;
  gcpProject: string;
  region: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    partial: number;
    skipped: number;
    totalResources: number;
    resourcesCreated: number;
    resourcesFailed: number;
    totalApiCalls: number;
    totalVerifications: number;
  };
  errorSummary: Record<string, number>;
  templates: TemplateDeployRecord[];
}

// ─── Reporter ──────────────────────────────────────────────────────────────

export class TemplateTestReporter {
  private records: TemplateDeployRecord[];
  private gcpProject: string;
  private region: string;
  private startedAt: string;

  constructor(records: TemplateDeployRecord[], config: { gcpProject: string; region: string; startedAt?: string }) {
    this.records = records;
    this.gcpProject = config.gcpProject;
    this.region = config.region;
    this.startedAt = config.startedAt || new Date().toISOString();
  }

  async generate(outputDir: string): Promise<{ htmlPath: string; jsonPath: string }> {
    mkdirSync(outputDir, { recursive: true });

    const report = this.buildReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const jsonPath = join(outputDir, `gcp-template-report-${timestamp}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const htmlPath = join(outputDir, `gcp-template-report-${timestamp}.html`);
    writeFileSync(htmlPath, this.renderHtml(report));

    // Also write a "latest" symlink-style copy for easy access
    writeFileSync(join(outputDir, 'latest-report.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(outputDir, 'latest-report.html'), this.renderHtml(report));

    return { htmlPath, jsonPath };
  }

  private buildReport(): TestRunReport {
    const allErrors = this.records.flatMap((r) => r.errors);
    const completedAt = new Date().toISOString();

    let passed = 0;
    let failed = 0;
    let partial = 0;
    let skipped = 0;
    let totalResources = 0;
    let resourcesCreated = 0;
    let resourcesFailed = 0;
    let totalApiCalls = 0;
    let totalVerifications = 0;

    for (const r of this.records) {
      if (r.overallSuccess && r.errors.length === 0) passed++;
      else if (!r.phases.plan.success) skipped++;
      else if (r.overallSuccess) partial++;
      else failed++;

      totalResources += r.resources.length;
      resourcesCreated += r.resources.filter((res) => res.success).length;
      resourcesFailed += r.resources.filter((res) => !res.success).length;
      totalApiCalls += r.apiCalls.length;
      totalVerifications += r.phases.verify.verifications?.length || 0;
    }

    return {
      runId: `gcp-test-${this.startedAt}`,
      startedAt: this.startedAt,
      completedAt,
      duration_ms: this.records.reduce((sum, r) => sum + r.totalDuration_ms, 0),
      gcpProject: this.gcpProject,
      region: this.region,
      summary: {
        total: this.records.length,
        passed,
        failed,
        partial,
        skipped,
        totalResources,
        resourcesCreated,
        resourcesFailed,
        totalApiCalls,
        totalVerifications,
      },
      errorSummary: summarizeErrors(allErrors),
      templates: this.records,
    };
  }

  // ─── HTML Report ───────────────────────────────────────────

  private renderHtml(report: TestRunReport): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ICE GCP Template Test Report</title>
<style>
${CSS}
</style>
</head>
<body>
<div class="container">
  ${this.renderHeader(report)}
  ${this.renderSummary(report)}
  ${this.renderErrorSummary(report)}
  ${this.renderTemplateTable(report)}
  ${this.renderTemplateDetails(report)}
</div>
<script>
${JS}
</script>
</body>
</html>`;
  }

  private renderHeader(report: TestRunReport): string {
    const elapsed = formatDuration(report.duration_ms);
    const passRate = report.summary.total > 0 ? Math.round((report.summary.passed / report.summary.total) * 100) : 0;
    return `
<header>
  <h1>ICE GCP Template Test Report</h1>
  <div class="meta">
    <span>Project: <strong>${esc(report.gcpProject)}</strong></span>
    <span>Region: <strong>${esc(report.region)}</strong></span>
    <span>Duration: <strong>${elapsed}</strong></span>
    <span>Pass Rate: <strong>${passRate}%</strong></span>
  </div>
  <div class="meta">
    <span>Started: ${esc(report.startedAt)}</span>
    <span>Completed: ${esc(report.completedAt)}</span>
  </div>
</header>`;
  }

  private renderSummary(report: TestRunReport): string {
    const s = report.summary;
    return `
<section class="summary-grid">
  <div class="stat-card">${s.total}<small>Templates</small></div>
  <div class="stat-card pass">${s.passed}<small>Passed</small></div>
  <div class="stat-card fail">${s.failed}<small>Failed</small></div>
  <div class="stat-card partial">${s.partial}<small>Partial</small></div>
  <div class="stat-card">${s.skipped}<small>Skipped</small></div>
  <div class="stat-card">${s.totalResources}<small>Resources</small></div>
  <div class="stat-card pass">${s.resourcesCreated}<small>Created</small></div>
  <div class="stat-card fail">${s.resourcesFailed}<small>Failed</small></div>
</section>`;
  }

  private renderErrorSummary(report: TestRunReport): string {
    const entries = Object.entries(report.errorSummary).filter(([, v]) => v > 0);
    if (entries.length === 0) return '<section><h2>Errors</h2><p class="dim">No errors</p></section>';

    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    return `
<section>
  <h2>Errors (${total})</h2>
  <div class="error-grid">
    ${entries.map(([cat, count]) => `<div class="error-badge ${cat}">${cat}: ${count}</div>`).join('\n    ')}
  </div>
</section>`;
  }

  private renderTemplateTable(report: TestRunReport): string {
    const rows = report.templates
      .map((t) => {
        const status = this.getStatus(t);
        const resCount = t.resources.length;
        const resOk = t.resources.filter((r) => r.success).length;
        return `
    <tr class="tpl-row" data-id="${esc(t.templateId)}" onclick="toggleDetail('${esc(t.templateId)}')">
      <td><span class="status-badge ${status.class}">${status.label}</span></td>
      <td><strong>${esc(t.templateName)}</strong></td>
      <td>${esc(t.category)}</td>
      <td>${t.blockCount}</td>
      <td>${resOk}/${resCount}</td>
      <td>${formatDuration(t.totalDuration_ms)}</td>
      <td>${t.errors.length}</td>
    </tr>`;
      })
      .join('');

    return `
<section>
  <h2>Templates</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th><th>Template</th><th>Category</th><th>Blocks</th>
        <th>Resources</th><th>Duration</th><th>Errors</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</section>`;
  }

  private renderTemplateDetails(report: TestRunReport): string {
    return report.templates
      .map((t) => {
        const phaseTimeline = this.renderPhaseTimeline(t);
        const resourceTable = this.renderResourceTable(t);
        const logs = this.renderLogs(t);
        const errors = this.renderErrors(t);
        const verifications = this.renderVerifications(t);

        return `
<section class="detail" id="detail-${esc(t.templateId)}" style="display:none">
  <h3>${esc(t.templateName)} <span class="dim">${esc(t.templateId)}</span></h3>
  <div class="detail-meta">
    <span>Category: ${esc(t.category)}</span>
    <span>Difficulty: ${esc(t.difficulty || 'n/a')}</span>
    <span>Cost: ${esc(t.estimatedCost || 'n/a')}</span>
    <span>Blocks: ${t.blockCount}</span>
    <span>Duration: ${formatDuration(t.totalDuration_ms)}</span>
  </div>
  ${phaseTimeline}
  ${resourceTable}
  ${verifications}
  ${errors}
  ${logs}
</section>`;
      })
      .join('');
  }

  private renderPhaseTimeline(t: TemplateDeployRecord): string {
    const phases = [
      { name: 'Select', key: 'templateSelect' },
      { name: 'Canvas', key: 'canvasLoad' },
      { name: 'Plan', key: 'plan' },
      { name: 'Deploy', key: 'deploy' },
      { name: 'Verify', key: 'verify' },
      { name: 'Destroy', key: 'destroy' },
      { name: 'Verify Removal', key: 'verifyRemoval' },
    ];

    const dots = phases
      .map((p) => {
        const phase = (t.phases as Record<string, { success: boolean; duration_ms: number }>)[p.key];
        if (!phase || !phase.duration_ms) return `<span class="phase-dot pending" title="${p.name}">&#9675;</span>`;
        const cls = phase.success ? 'pass' : 'fail';
        return `<span class="phase-dot ${cls}" title="${p.name}: ${formatDuration(phase.duration_ms)}">&#9679;</span>`;
      })
      .join('<span class="phase-arrow">&rarr;</span>');

    return `<div class="phase-timeline">${dots}</div>`;
  }

  private renderResourceTable(t: TemplateDeployRecord): string {
    if (t.resources.length === 0) return '';
    const rows = t.resources
      .map(
        (r) => `
      <tr>
        <td>${r.success ? '&#10003;' : '&#10007;'}</td>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.type)}</code></td>
        <td>${esc(r.action)}</td>
        <td>${formatDuration(r.duration_ms)}</td>
        <td><code>${esc(r.provider_id || '-')}</code></td>
        <td>${r.verified ? '&#10003;' : r.verifyError ? '&#10007;' : '-'}</td>
        <td class="error-text">${esc(r.error || '')}</td>
      </tr>`,
      )
      .join('');

    return `
  <h4>Resources</h4>
  <table class="resource-table">
    <thead><tr>
      <th></th><th>Name</th><th>Type</th><th>Action</th><th>Duration</th><th>Provider ID</th><th>Verified</th><th>Error</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  }

  private renderVerifications(t: TemplateDeployRecord): string {
    const v = t.phases.verify.verifications || [];
    if (v.length === 0) return '';
    const rows = v
      .map(
        (r: ResourceVerification) => `
      <tr>
        <td>${r.exists ? '&#10003;' : '&#10007;'}</td>
        <td>${esc(r.name)}</td>
        <td><code>${esc(r.type)}</code></td>
        <td class="error-text">${esc(r.error || '')}</td>
      </tr>`,
      )
      .join('');

    return `
  <h4>GCloud Verification</h4>
  <table class="resource-table">
    <thead><tr><th></th><th>Name</th><th>Type</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  }

  private renderErrors(t: TemplateDeployRecord): string {
    if (t.errors.length === 0) return '';
    const items = t.errors
      .map(
        (e: ClassifiedError) => `
      <div class="error-item">
        <span class="error-badge ${e.category}">${e.category}</span>
        ${e.resource ? `<strong>${esc(e.resource)}</strong>` : ''}
        <span class="dim">[${esc(e.phase)}]</span>
        <p>${esc(e.message)}</p>
        ${e.suggestion ? `<p class="suggestion">${esc(e.suggestion)}</p>` : ''}
        ${e.consoleUrl ? `<a href="${esc(e.consoleUrl)}" target="_blank" rel="noopener">Open in GCP Console</a>` : ''}
      </div>`,
      )
      .join('');

    return `<h4>Errors (${t.errors.length})</h4><div class="error-list">${items}</div>`;
  }

  private renderLogs(t: TemplateDeployRecord): string {
    if (t.deployLogs.length === 0) return '';
    const lines = t.deployLogs
      .slice(0, 200)
      .map((l) => esc(l))
      .join('\n');
    return `<h4>Deploy Logs</h4><pre class="log-block">${lines}</pre>`;
  }

  private getStatus(t: TemplateDeployRecord): { label: string; class: string } {
    if (!t.phases.plan.success) return { label: 'SKIP', class: 'skip' };
    if (t.overallSuccess && t.errors.length === 0) return { label: 'PASS', class: 'pass' };
    if (t.overallSuccess) return { label: 'PARTIAL', class: 'partial' };
    return { label: 'FAIL', class: 'fail' };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Inline CSS ────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --border: #2d3040;
  --text: #e4e6eb;
  --dim: #8b8fa3;
  --pass: #22c55e;
  --fail: #ef4444;
  --partial: #f59e0b;
  --skip: #6b7280;
  --accent: #3b82f6;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; }
.container { max-width: 1200px; margin: 0 auto; padding: 24px; }
header { margin-bottom: 24px; }
header h1 { font-size: 24px; margin-bottom: 8px; }
.meta { display: flex; gap: 24px; flex-wrap: wrap; color: var(--dim); font-size: 13px; margin-top: 4px; }
.meta strong { color: var(--text); }

h2 { font-size: 18px; margin: 24px 0 12px; }
h3 { font-size: 16px; margin-bottom: 8px; }
h4 { font-size: 14px; margin: 16px 0 8px; color: var(--dim); }
.dim { color: var(--dim); font-size: 12px; }

.summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-align: center; font-size: 28px; font-weight: 700; }
.stat-card small { display: block; font-size: 11px; font-weight: 400; color: var(--dim); margin-top: 4px; }
.stat-card.pass { color: var(--pass); border-color: var(--pass); }
.stat-card.fail { color: var(--fail); border-color: var(--fail); }
.stat-card.partial { color: var(--partial); border-color: var(--partial); }

table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
th { background: rgba(255,255,255,0.03); color: var(--dim); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
.tpl-row { cursor: pointer; transition: background 0.15s; }
.tpl-row:hover { background: rgba(255,255,255,0.04); }

.status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.status-badge.pass { background: rgba(34,197,94,0.15); color: var(--pass); }
.status-badge.fail { background: rgba(239,68,68,0.15); color: var(--fail); }
.status-badge.partial { background: rgba(245,158,11,0.15); color: var(--partial); }
.status-badge.skip { background: rgba(107,114,128,0.15); color: var(--skip); }

.detail { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 8px 0; }
.detail-meta { display: flex; gap: 16px; flex-wrap: wrap; color: var(--dim); font-size: 12px; margin-bottom: 12px; }

.phase-timeline { display: flex; align-items: center; gap: 4px; margin: 12px 0; flex-wrap: wrap; }
.phase-dot { font-size: 18px; cursor: default; }
.phase-dot.pass { color: var(--pass); }
.phase-dot.fail { color: var(--fail); }
.phase-dot.pending { color: var(--dim); }
.phase-arrow { color: var(--dim); font-size: 12px; }

.resource-table { font-size: 12px; }
.resource-table code { font-size: 11px; background: rgba(255,255,255,0.05); padding: 2px 4px; border-radius: 3px; }
.error-text { color: var(--fail); font-size: 11px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.error-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.error-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; background: rgba(239,68,68,0.1); color: var(--fail); }
.error-badge.api_not_enabled { background: rgba(245,158,11,0.1); color: var(--partial); }
.error-badge.quota { background: rgba(245,158,11,0.1); color: var(--partial); }
.error-badge.config { background: rgba(59,130,246,0.1); color: var(--accent); }
.error-badge.build { background: rgba(168,85,247,0.1); color: #a855f7; }
.error-badge.permission { background: rgba(239,68,68,0.1); color: var(--fail); }
.error-badge.auth { background: rgba(239,68,68,0.1); color: var(--fail); }
.error-badge.network { background: rgba(107,114,128,0.1); color: var(--dim); }
.error-badge.timeout { background: rgba(107,114,128,0.1); color: var(--dim); }

.error-list { display: flex; flex-direction: column; gap: 8px; }
.error-item { background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-radius: 6px; padding: 10px; font-size: 12px; }
.error-item p { margin: 4px 0; }
.error-item a { color: var(--accent); font-size: 11px; }
.suggestion { color: var(--partial); font-style: italic; }

.log-block { background: #0a0c10; border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: 'SF Mono', 'Monaco', 'Consolas', monospace; font-size: 11px; line-height: 1.6; max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-all; color: var(--dim); }
`;

const JS = `
function toggleDetail(id) {
  const el = document.getElementById('detail-' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
`;
