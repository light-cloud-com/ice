/**
 * Template Deploy Fixture — UI helpers for full template deploy cycle
 *
 * Flow: /templates → click template → Create → canvas loads → deploy panel
 * All actions through the browser UI, no API calls.
 */
import type { Page } from '@playwright/test';
import { type IceActionEvent } from '../utils/action-log-reader';
import type { ResourceVerification } from '../utils/deploy-log-collector';
export declare const test: any;
export { expect } from '@playwright/test';
export declare class TemplateDeployHelper {
    private page;
    constructor(page: Page);
    /**
     * Navigate to /templates, find the template, click it to open details,
     * then click "Create" to create a project and navigate to canvas.
     */
    selectTemplate(templateName: string): Promise<void>;
    /** Debug screenshot — saved to test-results/gcp/debug/ */
    private debugScreenshot;
    /**
     * Wait for canvas nodes to appear after template selection.
     */
    waitForCanvasNodes(expectedMinNodes?: number): Promise<number>;
    /**
     * Click the GCP icon in the appbar → opens ProviderConnectModal → paste SA key → connect.
     */
    connectGCPViaUI(saKeyJson: string): Promise<void>;
    /**
     * Click GitHub icon in appbar → paste PAT → connect.
     */
    connectGitHubViaUI(patToken: string): Promise<void>;
    openDeployPanel(): Promise<void>;
    /** Close AI chat panel if open */
    private closeAiChat;
    configureDeploy(project: string, region: string): Promise<void>;
    plan(): Promise<{
        success: boolean;
        plan?: unknown;
        error?: string;
    }>;
    apply(timeout?: number): Promise<{
        success: boolean;
        result?: any;
        logs: string[];
        error?: string;
    }>;
    destroy(timeout?: number): Promise<{
        success: boolean;
        error?: string;
    }>;
    closeDeployPanel(): Promise<void>;
    resetForNextTemplate(): Promise<void>;
    screenshot(name: string, dir?: string): Promise<string>;
    captureAndClearActionLog(): Promise<IceActionEvent[]>;
    /**
     * Read the persisted node overlay for the currently active card via
     * the `/canvas/deploy/node-outputs/:cardId` endpoint. Used by the
     * Phase A regression check that asserts compute blocks carry a
     * `url` or `default_url` after deploy.
     *
     * Returns null when the active cardId can't be resolved (e.g. the
     * test is running outside a card context). Callers should treat
     * null as "skip the assertion", not as a failure.
     */
    fetchNodeOverlay(environment?: string): Promise<Record<string, any> | null>;
    verifyResources(resources: Array<{
        name: string;
        type: string;
        provider_id?: string;
    }>, project: string, region: string): ResourceVerification[];
}
