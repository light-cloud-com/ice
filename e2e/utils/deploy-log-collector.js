/**
 * Deploy Log Collector — Structured collection of all deploy events per template
 *
 * Accumulates phase timing, resource results, action log events, deploy logs,
 * screenshots, and errors during a single template's deploy lifecycle.
 */
import { classifyDeployError } from './error-classifier';
// ─── Collector ─────────────────────────────────────────────────────────────
const EMPTY_PHASE = {
    success: false,
    duration_ms: 0,
    startedAt: '',
    completedAt: '',
};
export class DeployLogCollector {
    record;
    phaseTimers = new Map();
    gcpProject;
    constructor(template, gcpProject) {
        this.gcpProject = gcpProject;
        this.record = {
            templateId: template.id,
            templateName: template.name,
            category: template.category,
            difficulty: template.difficulty,
            estimatedCost: template.estimatedCost,
            blockCount: template.blocks.length,
            phases: {
                templateSelect: { ...EMPTY_PHASE },
                canvasLoad: { ...EMPTY_PHASE },
                plan: { ...EMPTY_PHASE, plan: undefined },
                deploy: { ...EMPTY_PHASE, result: undefined },
                verify: { ...EMPTY_PHASE, verifications: [] },
                destroy: { ...EMPTY_PHASE, result: undefined },
                verifyRemoval: { ...EMPTY_PHASE, verifications: [] },
            },
            resources: [],
            deployLogs: [],
            apiCalls: [],
            errors: [],
            screenshots: [],
            overallSuccess: false,
            totalDuration_ms: 0,
        };
    }
    // ── Phase Tracking ─────────────────────────────────────────
    startPhase(name) {
        this.phaseTimers.set(name, Date.now());
        const phase = this.getPhase(name);
        if (phase) {
            phase.startedAt = new Date().toISOString();
        }
    }
    endPhase(name, result) {
        const startTime = this.phaseTimers.get(name) || Date.now();
        const phase = this.getPhase(name);
        if (phase) {
            phase.duration_ms = Date.now() - startTime;
            phase.completedAt = new Date().toISOString();
            phase.success = result?.success ?? true;
            phase.error = result?.error;
            // Store plan/result if provided
            if ('plan' in phase && result && 'plan' in result) {
                phase.plan = result.plan;
            }
            if ('result' in phase && result && 'result' in result) {
                phase.result = result.result;
            }
            // Classify errors
            if (result?.error) {
                this.record.errors.push(classifyDeployError(result.error, {
                    phase: name,
                    gcpProject: this.gcpProject,
                }));
            }
        }
    }
    // ── Resource Results ───────────────────────────────────────
    setResources(resources) {
        this.record.resources = resources.map((r) => ({
            ...r,
            verified: false,
        }));
        // Classify resource-level errors
        for (const r of resources) {
            if (r.error) {
                this.record.errors.push(classifyDeployError(r.error, {
                    resource: r.name,
                    phase: 'deploy',
                    gcpProject: this.gcpProject,
                }));
            }
        }
    }
    // ── Verifications ──────────────────────────────────────────
    setVerifications(phase, verifications) {
        const p = this.record.phases[phase];
        if (p && 'verifications' in p) {
            p.verifications = verifications;
        }
        // Update resource verification status (for the main verify phase)
        if (phase === 'verify') {
            for (const v of verifications) {
                const resource = this.record.resources.find((r) => r.name === v.name);
                if (resource) {
                    resource.verified = v.exists;
                    resource.verifyError = v.error || undefined;
                    resource.gcpResource = v.gcpResource;
                }
            }
        }
    }
    // ── Logs ───────────────────────────────────────────────────
    captureDeployLogs(logs) {
        this.record.deployLogs = logs;
    }
    captureActionLog(events) {
        // Extract API calls
        this.record.apiCalls = events
            .filter((e) => e.action === 'api_response' || e.action === 'api_error')
            .map((e) => ({
            method: e.detail.method || 'GET',
            path: e.detail.path || e.target,
            status: e.detail.status || 0,
            duration_ms: e.duration_ms || 0,
            timestamp: new Date(e.ts).toISOString(),
        }));
        // Capture any api_error events as classified errors
        for (const e of events) {
            if (e.action === 'api_error') {
                const msg = e.detail.error || e.detail.message || e.target;
                this.record.errors.push(classifyDeployError(msg, {
                    phase: 'deploy',
                    httpStatus: e.detail.status || undefined,
                    gcpProject: this.gcpProject,
                }));
            }
        }
    }
    // ── Screenshots ────────────────────────────────────────────
    addScreenshot(phase, path) {
        this.record.screenshots.push({ phase, path });
    }
    // ── Finalization ───────────────────────────────────────────
    finalize() {
        // Compute total duration
        const phases = Object.values(this.record.phases);
        this.record.totalDuration_ms = phases.reduce((sum, p) => sum + (p.duration_ms || 0), 0);
        // Compute overall success
        const deployPhase = this.record.phases.deploy;
        const planPhase = this.record.phases.plan;
        this.record.overallSuccess = planPhase.success && deployPhase.success;
        // Deduplicate errors (same message + resource)
        const seen = new Set();
        this.record.errors = this.record.errors.filter((e) => {
            const key = `${e.resource || ''}:${e.message}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
        return this.record;
    }
    // ── Internal ───────────────────────────────────────────────
    getPhase(name) {
        return this.record.phases[name];
    }
}
