/**
 * Live Progress — Writes progress.json + terminal output during test runs
 *
 * Updated after every phase transition. The dashboard reads progress.json
 * via SSE polling. Terminal output is printed via console.log.
 */
export interface TemplateProgressEntry {
    id: string;
    name: string;
    category: string;
    status: 'wait' | 'running' | 'pass' | 'partial' | 'fail' | 'skip';
    currentPhase?: string;
    currentDetail?: string;
    phases: Record<string, {
        status: 'pending' | 'running' | 'done' | 'fail';
        duration_ms?: number;
    }>;
    duration_ms: number;
    resources?: {
        total: number;
        success: number;
        failed: number;
    };
    resourceDetails?: Array<{
        name: string;
        type: string;
        success: boolean;
        error?: string;
    }>;
    errors: string[];
}
export interface ProgressState {
    status: 'idle' | 'running' | 'completed' | 'stopped';
    startedAt: string;
    elapsed_ms: number;
    completed: number;
    total: number;
    templates: TemplateProgressEntry[];
    logs: string[];
    errors: string[];
}
export declare class LiveProgress {
    private state;
    private outputDir;
    private startTime;
    constructor(templates: Array<{
        id: string;
        name: string;
        category: string;
    }>, outputDir: string);
    startTemplate(templateId: string): void;
    completeTemplate(templateId: string, success: boolean, hasErrors: boolean): void;
    startPhase(templateId: string, phase: string): void;
    updatePhase(templateId: string, detail: string): void;
    endPhase(templateId: string, phase: string, success: boolean, duration_ms: number): void;
    setResources(templateId: string, total: number, success: number, failed: number, details?: Array<{
        name: string;
        type: string;
        success: boolean;
        error?: string;
    }>): void;
    addLog(message: string): void;
    addError(templateId: string, error: string): void;
    complete(): void;
    stop(): void;
    private flush;
    private printTerminal;
    private findTemplate;
}
