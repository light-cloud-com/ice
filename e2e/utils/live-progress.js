/**
 * Live Progress — Writes progress.json + terminal output during test runs
 *
 * Updated after every phase transition. The dashboard reads progress.json
 * via SSE polling. Terminal output is printed via console.log.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
// ─── Phase names ───────────────────────────────────────────────────────────
const ALL_PHASES = ['templateSelect', 'canvasLoad', 'plan', 'deploy', 'verify', 'destroy', 'verifyRemoval'];
// ─── LiveProgress Class ────────────────────────────────────────────────────
export class LiveProgress {
    state;
    outputDir;
    startTime;
    constructor(templates, outputDir) {
        this.outputDir = outputDir;
        this.startTime = Date.now();
        mkdirSync(outputDir, { recursive: true });
        this.state = {
            status: 'running',
            startedAt: new Date().toISOString(),
            elapsed_ms: 0,
            completed: 0,
            total: templates.length,
            templates: templates.map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
                status: 'wait',
                phases: Object.fromEntries(ALL_PHASES.map((p) => [p, { status: 'pending' }])),
                duration_ms: 0,
                errors: [],
            })),
            logs: [],
            errors: [],
        };
        this.flush();
    }
    // ── Template lifecycle ─────────────────────────────────────
    startTemplate(templateId) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            entry.status = 'running';
            entry.duration_ms = 0;
        }
        this.flush();
    }
    completeTemplate(templateId, success, hasErrors) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            if (!success && !entry.phases.plan?.duration_ms) {
                entry.status = 'skip';
            }
            else if (success && !hasErrors) {
                entry.status = 'pass';
            }
            else if (success) {
                entry.status = 'partial';
            }
            else {
                entry.status = 'fail';
            }
            this.state.completed++;
        }
        this.flush();
    }
    // ── Phase lifecycle ────────────────────────────────────────
    startPhase(templateId, phase) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            entry.currentPhase = phase;
            entry.currentDetail = undefined;
            if (entry.phases[phase]) {
                entry.phases[phase].status = 'running';
            }
        }
        this.flush();
    }
    updatePhase(templateId, detail) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            entry.currentDetail = detail;
        }
        // Don't flush on every detail update — too chatty
    }
    endPhase(templateId, phase, success, duration_ms) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            if (entry.phases[phase]) {
                entry.phases[phase].status = success ? 'done' : 'fail';
                entry.phases[phase].duration_ms = duration_ms;
            }
            entry.duration_ms += duration_ms;
            if (phase === entry.currentPhase) {
                entry.currentPhase = undefined;
                entry.currentDetail = undefined;
            }
        }
        this.flush();
    }
    // ── Resources ──────────────────────────────────────────────
    setResources(templateId, total, success, failed, details) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            entry.resources = { total, success, failed };
            if (details) {
                entry.resourceDetails = details.map((d) => ({
                    name: d.name,
                    type: d.type,
                    success: d.success,
                    error: d.error,
                }));
            }
        }
        this.flush();
    }
    // ── Logging ────────────────────────────────────────────────
    addLog(message) {
        const timestamp = new Date().toISOString().slice(11, 19);
        this.state.logs.push(`[${timestamp}] ${message}`);
        // Keep last 100 log lines
        if (this.state.logs.length > 100) {
            this.state.logs = this.state.logs.slice(-100);
        }
    }
    addError(templateId, error) {
        const entry = this.findTemplate(templateId);
        if (entry) {
            entry.errors.push(error);
        }
        this.state.errors.push(`${templateId}: ${error}`);
        this.flush();
    }
    // ── Completion ─────────────────────────────────────────────
    complete() {
        this.state.status = 'completed';
        this.flush();
    }
    stop() {
        this.state.status = 'stopped';
        this.flush();
    }
    // ── Output ─────────────────────────────────────────────────
    flush() {
        this.state.elapsed_ms = Date.now() - this.startTime;
        // Write JSON
        const progressPath = join(this.outputDir, 'progress.json');
        writeFileSync(progressPath, JSON.stringify(this.state, null, 2));
        // Print terminal
        this.printTerminal();
    }
    printTerminal() {
        const elapsed = formatMs(this.state.elapsed_ms);
        const done = this.state.completed;
        const total = this.state.total;
        const errCount = this.state.errors.length;
        const lines = ['', `  GCP Template Tests — ${done}/${total} done — ${elapsed}`, '  ' + '─'.repeat(56)];
        for (const t of this.state.templates) {
            const icon = STATUS_ICONS[t.status];
            const dur = t.duration_ms ? formatMs(t.duration_ms) : '—';
            const res = t.resources ? `${t.resources.success}/${t.resources.total}` : '—';
            const name = t.name.padEnd(25).slice(0, 25);
            const phase = t.currentPhase || (t.status === 'wait' ? '' : 'done');
            lines.push(`  ${icon} ${name} ${phase.padEnd(12)} ${dur.padStart(7)}  ${res.padStart(5)}`);
            if (t.currentDetail) {
                lines.push(`     └─ ${t.currentDetail}`);
            }
        }
        lines.push('  ' + '─'.repeat(56));
        lines.push(`  Errors: ${errCount}`);
        lines.push('');
        // Clear previous output and reprint
        console.log(lines.join('\n'));
    }
    findTemplate(id) {
        return this.state.templates.find((t) => t.id === id);
    }
}
// ─── Helpers ───────────────────────────────────────────────────────────────
const STATUS_ICONS = {
    wait: '  ',
    running: '>>', // Use simple ASCII for terminal compatibility
    pass: 'OK',
    partial: '!!',
    fail: 'XX',
    skip: '--',
};
function formatMs(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(0)}s`;
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}m${s}s`;
}
