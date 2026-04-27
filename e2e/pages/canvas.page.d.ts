import { type Page } from '@playwright/test';
export declare class CanvasPageObject {
    private page;
    constructor(page: Page);
    get canvas(): import("@playwright/test").Locator;
    get palette(): import("@playwright/test").Locator;
    get toolbar(): import("@playwright/test").Locator;
    goto(projectId?: string): Promise<void>;
    waitForReady(): Promise<void>;
    getNodeByType(iceType: string): Promise<import("@playwright/test").Locator>;
    getAllNodes(): Promise<import("@playwright/test").Locator[]>;
    openDeployPanel(): Promise<void>;
}
