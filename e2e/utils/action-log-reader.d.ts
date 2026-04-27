/**
 * Action Log Reader — Playwright utilities for reading structured action logs
 *
 * Reads events from window.__ICE_ACTION_LOG__ injected by the action-logger.
 */
import type { Page } from '@playwright/test';
export interface IceActionEvent {
    ts: number;
    seq: number;
    category: string;
    action: string;
    target: string;
    detail: Record<string, unknown>;
    duration_ms?: number;
}
/**
 * Get all action log events from the page.
 */
export declare function getActionLog(page: Page): Promise<IceActionEvent[]>;
/**
 * Get action log events filtered by category.
 */
export declare function getLogByCategory(page: Page, category: string): Promise<IceActionEvent[]>;
/**
 * Get all API call/response events, optionally filtered by path pattern.
 */
export declare function getApiCalls(page: Page, pathPattern?: string | RegExp): Promise<IceActionEvent[]>;
/**
 * Get all error events from the action log.
 */
export declare function getErrors(page: Page): Promise<IceActionEvent[]>;
/**
 * Wait for a specific action event to appear in the log.
 */
export declare function waitForAction(page: Page, predicate: (event: IceActionEvent) => boolean, timeout?: number): Promise<IceActionEvent>;
/**
 * Wait for an API response matching the given path.
 */
export declare function waitForApiResponse(page: Page, pathPattern: string, timeout?: number): Promise<IceActionEvent>;
/**
 * Get the last deploy result from the action log.
 */
export declare function getLastDeployResult(page: Page): Promise<IceActionEvent | null>;
/**
 * Get a summary of the action log for debugging.
 */
export declare function getLogSummary(page: Page): Promise<string>;
/**
 * Clear the action log on the page.
 */
export declare function clearActionLog(page: Page): Promise<void>;
/**
 * Dump the action log to a JSON string (for saving to file on failure).
 */
export declare function dumpActionLog(page: Page): Promise<string>;
