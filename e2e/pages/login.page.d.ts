import { type Page } from '@playwright/test';
export declare class LoginPageObject {
    private page;
    constructor(page: Page);
    goto(): Promise<void>;
    login(email: string, password: string): Promise<void>;
    getErrorMessage(): Promise<string | null>;
}
