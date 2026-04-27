/**
 * Template Test Reporter — HTML + JSON aggregate report generator
 *
 * Takes TemplateDeployRecord[] from all tested templates and produces:
 * - JSON report with full data
 * - Self-contained HTML report with interactive sections
 */
import type { TemplateDeployRecord } from './deploy-log-collector';
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
export declare class TemplateTestReporter {
    private records;
    private gcpProject;
    private region;
    private startedAt;
    constructor(records: TemplateDeployRecord[], config: {
        gcpProject: string;
        region: string;
        startedAt?: string;
    });
    generate(outputDir: string): Promise<{
        htmlPath: string;
        jsonPath: string;
    }>;
    private buildReport;
    private renderHtml;
    private renderHeader;
    private renderSummary;
    private renderErrorSummary;
    private renderTemplateTable;
    private renderTemplateDetails;
    private renderPhaseTimeline;
    private renderResourceTable;
    private renderVerifications;
    private renderErrors;
    private renderLogs;
    private getStatus;
}
