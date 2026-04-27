import { type Page } from '@playwright/test';
export declare class DeployPageObject {
    private page;
    constructor(page: Page);
    get panel(): import("@playwright/test").Locator;
    get deployButton(): import("@playwright/test").Locator;
    get status(): import("@playwright/test").Locator;
    get log(): import("@playwright/test").Locator;
    selectProject(projectId: string): Promise<void>;
    clickDeploy(): Promise<void>;
    waitForComplete(): Promise<void>;
    getStatus(): Promise<string | null>;
}
