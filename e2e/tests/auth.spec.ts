import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should register new user and redirect to dashboard', async ({ page }) => {
    await page.goto('/signup');

    await page.fill('input[type="text"]', 'New User');
    await page.fill('input[type="email"]', `test-${Date.now()}@ice-saas.dev`);
    await page.fill('input[type="password"]', 'securepass123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/onboarding');
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('should persist token in localStorage after login', async ({ page }) => {
    // Clear any existing token first
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('ice-token'));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Verify token was stored
    const token = await page.evaluate(() => localStorage.getItem('ice-token'));
    expect(token).toBeTruthy();
    expect(token!.split('.').length).toBe(3); // JWT has 3 parts
  });

  test('should logout and redirect to login', async ({ page }) => {
    // Clear stale token from previous tests
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('ice-token'));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'testpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Clear token to simulate logout
    await page.evaluate(() => localStorage.removeItem('ice-token'));
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });
});
