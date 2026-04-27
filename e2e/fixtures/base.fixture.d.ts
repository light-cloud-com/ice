/**
 * Base Fixture — Authenticated page + API client
 *
 * Community edition: no JWT required — the gateway auto-seeds a local user
 * and requireAuth skips token validation.
 */
import { type Page } from '@playwright/test';
export interface ApiClient {
    post: (path: string, body?: any) => Promise<any>;
    get: (path: string) => Promise<any>;
}
export declare const test: import("@playwright/test").TestType<import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions & {
    authenticatedPage: Page;
    apiClient: ApiClient;
}, import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions>;
export { expect } from '@playwright/test';
