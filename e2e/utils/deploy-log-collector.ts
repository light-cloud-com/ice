/**
 * Deploy Log Collector — Structured collection of all deploy events per template
 *
 * Accumulates phase timing, resource results, action log events, deploy logs,
 * screenshots, and errors during a single template's deploy lifecycle.
 */

import { classifyDeployError, type ClassifiedError } from './error-classifier';
import type { IceActionEvent } from './action-log-reader';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PhaseResult {
  success: boolean;
  duration_ms: number;
  startedAt: string;
  completedAt: string;
  error?: string;
}

export interface ResourceDetail {
  name: string;
  type: string;
  action: string;
  success: boolean;
  error?: string;
  provider_id?: string;
  duration_ms: number;
  verified: boolean;
  verifyError?: string;
  gcpResource?: Record<string, unknown>;
}

export interface ResourceVerification {
  name: string;
  type: string;
  exists: boolean;
  error?: string;
  gcpResource?: Record<string, unknown>;
}

export interface ApiCallRecord {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  timestamp: string;
}

export interface TemplateDeployRecord {
  templateId: string;
  templateName: string;
  category: string;
  difficulty?: string;
  estimatedCost?: string;
  blockCount: number;

  phases: {
    templateSelect: PhaseResult;
    canvasLoad: PhaseResult;
    plan: PhaseResult & { plan?: unknown };
    deploy: PhaseResult & { result?: unknown };
    verify: PhaseResult & { verifications: ResourceVerification[] };
    destroy: PhaseResult & { result?: unknown };
    verifyRemoval: PhaseResult & { verifications: ResourceVerification[] };
  };

  resources: ResourceDetail[];
  deployLogs: string[];
  apiCalls: ApiCallRecord[];
  errors: ClassifiedError[];
  screenshots: { phase: string; path: string }[];
  overallSuccess: boolean;
  totalDuration_ms: number;
}

// ─── Collector ─────────────────────────────────────────────────────────────

const EMPTY_PHASE: PhaseResult = {
  success: false,
  duration_ms: 0,
  startedAt: '',
  completedAt: '',
};

export class DeployLogCollector {
  readonly record: TemplateDeployRecord;
  private phaseTimers: Map<string, number> = new Map();
  private gcpProject?: string;

  constructor(
    template: { id: string; name: string; category: string; difficulty?: string; estimatedCost?: string; blocks: unknown[] },
    gcpProject?: string,
  ) {
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

  startPhase(name: string): void {
    this.phaseTimers.set(name, Date.now());
    const phase = this.getPhase(name);
    if (phase) {
      phase.startedAt = new Date().toISOString();
    }
  }

  endPhase(name: string, result?: { success?: boolean; error?: string; plan?: unknown; result?: unknown }): void {
    const startTime = this.phaseTimers.get(name) || Date.now();
    const phase = this.getPhase(name);
    if (phase) {
      phase.duration_ms = Date.now() - startTime;
      phase.completedAt = new Date().toISOString();
      phase.success = result?.success ?? true;
      phase.error = result?.error;

      // Store plan/result if provided
      if ('plan' in phase && result && 'plan' in result) {
        (phase as PhaseResult & { plan?: unknown }).plan = result.plan;
      }
      if ('result' in phase && result && 'result' in result) {
        (phase as PhaseResult & { result?: unknown }).result = result.result;
      }

      // Classify errors
      if (result?.error) {
        this.record.errors.push(
          classifyDeployError(result.error, {
            phase: name,
            gcpProject: this.gcpProject,
          }),
        );
      }
    }
  }

  // ── Resource Results ───────────────────────────────────────

  setResources(resources: Array<{
    name: string;
    type: string;
    action: string;
    success: boolean;
    error?: string;
    provider_id?: string;
    duration_ms: number;
  }>): void {
    this.record.resources = resources.map((r) => ({
      ...r,
      verified: false,
    }));

    // Classify resource-level errors
    for (const r of resources) {
      if (r.error) {
        this.record.errors.push(
          classifyDeployError(r.error, {
            resource: r.name,
            phase: 'deploy',
            gcpProject: this.gcpProject,
          }),
        );
      }
    }
  }

  // ── Verifications ──────────────────────────────────────────

  setVerifications(phase: 'verify' | 'verifyRemoval', verifications: ResourceVerification[]): void {
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

  captureDeployLogs(logs: string[]): void {
    this.record.deployLogs = logs;
  }

  captureActionLog(events: IceActionEvent[]): void {
    // Extract API calls
    this.record.apiCalls = events
      .filter((e) => e.action === 'api_response' || e.action === 'api_error')
      .map((e) => ({
        method: (e.detail.method as string) || 'GET',
        path: (e.detail.path as string) || e.target,
        status: (e.detail.status as number) || 0,
        duration_ms: e.duration_ms || 0,
        timestamp: new Date(e.ts).toISOString(),
      }));

    // Capture any api_error events as classified errors
    for (const e of events) {
      if (e.action === 'api_error') {
        const msg = (e.detail.error as string) || (e.detail.message as string) || e.target;
        this.record.errors.push(
          classifyDeployError(msg, {
            phase: 'deploy',
            httpStatus: (e.detail.status as number) || undefined,
            gcpProject: this.gcpProject,
          }),
        );
      }
    }
  }

  // ── Screenshots ────────────────────────────────────────────

  addScreenshot(phase: string, path: string): void {
    this.record.screenshots.push({ phase, path });
  }

  // ── Finalization ───────────────────────────────────────────

  finalize(): TemplateDeployRecord {
    // Compute total duration
    const phases = Object.values(this.record.phases) as PhaseResult[];
    this.record.totalDuration_ms = phases.reduce((sum, p) => sum + (p.duration_ms || 0), 0);

    // Compute overall success
    const deployPhase = this.record.phases.deploy;
    const planPhase = this.record.phases.plan;
    this.record.overallSuccess = planPhase.success && deployPhase.success;

    // Deduplicate errors (same message + resource)
    const seen = new Set<string>();
    this.record.errors = this.record.errors.filter((e) => {
      const key = `${e.resource || ''}:${e.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return this.record;
  }

  // ── Internal ───────────────────────────────────────────────

  private getPhase(name: string): PhaseResult | undefined {
    return (this.record.phases as Record<string, PhaseResult>)[name];
  }
}
