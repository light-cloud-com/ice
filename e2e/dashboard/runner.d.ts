/**
 * Test Runner — Spawns/kills Playwright test process
 *
 * Manages the lifecycle of a test run, reading progress from the
 * progress.json file written by the test suite.
 */
import type { ProgressState } from '../utils/live-progress';
export declare class TestRunner {
    private process;
    private _status;
    private _output;
    private _startedAt;
    private _error;
    private _config;
    get status(): "idle" | "running" | "completed" | "failed" | "stopped";
    get isRunning(): boolean;
    /**
     * Check if the ICE backend + frontend are running (required for Playwright tests).
     */
    preflight(): Promise<{
        ok: boolean;
        backend: boolean;
        frontend: boolean;
        frontendPort?: number;
        error?: string;
    }>;
    /**
     * Start a test run with selected templates.
     */
    start(config: {
        templates: string[];
        project: string;
        region: string;
        saKeyPath: string;
        githubToken?: string;
    }): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Stop the current test run.
     */
    stop(): {
        success: boolean;
    };
    /**
     * Read current progress from progress.json.
     */
    getProgress(): ProgressState | null;
    /**
     * Get full status including output, error, config.
     */
    getFullStatus(): {
        status: "idle" | "running" | "completed" | "failed" | "stopped";
        startedAt: string;
        error: string;
        config: {
            templates: string[];
            project: string;
            region: string;
        } | null;
        outputLineCount: number;
        progress: any;
    };
    /**
     * Get process output (last N lines).
     */
    getOutput(limit?: number): string[];
    /**
     * Get latest report path.
     */
    getLatestReportPath(): string | null;
    /**
     * Write a fallback HTML report from captured output when no formal report was generated.
     */
    private writeFallbackReport;
    private log;
}
