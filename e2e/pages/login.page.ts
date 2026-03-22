import { type Page } from '@playwright/test';

export class LoginPageObject {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.fill('input[type="email"]', email);
    await this.page.fill('input[type="password"]', password);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('/');
  }

  async getErrorMessage() {
    return this.page.locator('.bg-red-900\\/20').textContent();
  }
}
