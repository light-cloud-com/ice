/**
 * Deploy Log Collector — Structured collection of all deploy events per template
 *
 * Accumulates phase timing, resource results, action log events, deploy logs,
 * screenshots, and errors during a single template's deploy lifecycle.
 */
import { type ClassifiedError } from './error-classifier';
import type { IceActionEvent } from './action-log-reader';
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
        plan: PhaseResult & {
            plan?: unknown;
        };
        deploy: PhaseResult & {
            result?: unknown;
        };
        verify: PhaseResult & {
            verifications: ResourceVerification[];
        };
        destroy: PhaseResult & {
            result?: unknown;
        };
        verifyRemoval: PhaseResult & {
            verifications: ResourceVerification[];
        };
    };
    resources: ResourceDetail[];
    deployLogs: string[];
    apiCalls: ApiCallRecord[];
    errors: ClassifiedError[];
    screenshots: {
        phase: string;
        path: string;
    }[];
    overallSuccess: boolean;
    totalDuration_ms: number;
}
export declare class DeployLogCollector {
    readonly record: TemplateDeployRecord;
    private phaseTimers;
    private gcpProject?;
    constructor(template: {
        id: string;
        name: string;
        category: string;
        difficulty?: string;
        estimatedCost?: string;
        blocks: unknown[];
    }, gcpProject?: string);
    startPhase(name: string): void;
    endPhase(name: string, result?: {
        success?: boolean;
        error?: string;
        plan?: unknown;
        result?: unknown;
    }): void;
    setResources(resources: Array<{
        name: string;
        type: string;
        action: string;
        success: boolean;
        error?: string;
        provider_id?: string;
        duration_ms: number;
    }>): void;
    setVerifications(phase: 'verify' | 'verifyRemoval', verifications: ResourceVerification[]): void;
    captureDeployLogs(logs: string[]): void;
    captureActionLog(events: IceActionEvent[]): void;
    addScreenshot(phase: string, path: string): void;
    finalize(): TemplateDeployRecord;
    private getPhase;
}
