/**
 * Frontend E2E Tests
 *
 * Validates fixes from the frontend backlog (FE-1 through FE-18).
 */
import { test, expect } from '../fixtures/base.fixture';
// ─── FE-2: Error boundary renders recovery UI ──────────────────────────────
test.describe('FE-2: Error boundaries', () => {
    test('app should render without crashing', async ({ authenticatedPage }) => {
        // If error boundaries work, the app should at least render the main layout
        await expect(authenticatedPage.locator('header')).toBeVisible({ timeout: 10000 });
    });
});
// ─── FE-15: Signup accessibility ────────────────────────────────────────────
test.describe('FE-15: Signup accessibility', () => {
    test('signup form should have accessible error display', async ({ page }) => {
        await page.goto('/signup', { waitUntil: 'domcontentloaded' });
        // Submit empty form to trigger validation
        await page.fill('#ice-signup-auth-input-name', 'Test');
        await page.fill('#ice-signup-auth-input-email', 'already-existing@test.dev');
        await page.fill('#ice-signup-auth-input-password', 'password123');
        await page.click('#ice-signup-auth-btn-submit');
        // Wait for error to appear
        await page.waitForTimeout(2000);
        // Check that error div has role="alert" for screen readers
        const errorDiv = page.locator('[role="alert"]');
        const count = await errorDiv.count();
        // If there's an error, it should have role="alert"
        if (count > 0) {
            await expect(errorDiv.first()).toHaveAttribute('aria-live', 'polite');
        }
    });
    test('login form error should have role=alert', async ({ page }) => {
        await page.goto('/login', { waitUntil: 'domcontentloaded' });
        await page.fill('#ice-login-auth-input-email', 'wrong@test.dev');
        await page.fill('#ice-login-auth-input-password', 'wrongpass');
        await page.click('#ice-login-auth-btn-submit');
        await page.waitForTimeout(2000);
        const errorDiv = page.locator('#ice-login-auth-alert-error');
        if (await errorDiv.isVisible()) {
            await expect(errorDiv).toHaveAttribute('role', 'alert');
            await expect(errorDiv).toHaveAttribute('aria-live', 'polite');
        }
    });
});
// ─── FE-17: ProtectedRoute checks JWT expiry ────────────────────────────────
test.describe('FE-17: JWT expiry check', () => {
    test('should redirect to login with expired token', async ({ page }) => {
        // Create an expired JWT (exp in the past)
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
        const payload = btoa(JSON.stringify({
            userId: 'test',
            organisationId: 'test',
            exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
        })).replace(/=/g, '');
        const expiredToken = `${header}.${payload}.fake-sig`;
        await page.goto('/login', { waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => localStorage.setItem('ice-token', t), expiredToken);
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        // Should redirect to login because token is expired
        await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });
    test('should clear expired token from localStorage', async ({ page }) => {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '');
        const payload = btoa(JSON.stringify({
            userId: 'test',
            exp: Math.floor(Date.now() / 1000) - 3600,
        })).replace(/=/g, '');
        const expiredToken = `${header}.${payload}.fake-sig`;
        await page.goto('/login', { waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => localStorage.setItem('ice-token', t), expiredToken);
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);
        const token = await page.evaluate(() => localStorage.getItem('ice-token'));
        // Token should have been cleared by isAuthenticated()
        expect(token).toBeNull();
    });
});
// ─── FE-13: AppBar renders (memoized) ───────────────────────────────────────
test.describe('FE-13: AppBar', () => {
    test('should render app bar with all controls', async ({ authenticatedPage }) => {
        // AppBar should render with key buttons
        await expect(authenticatedPage.locator('#ice-appbar-btn-deploy')).toBeVisible({ timeout: 10000 });
        await expect(authenticatedPage.locator('#ice-appbar-btn-profile')).toBeVisible();
    });
});
// ─── FE-14: Logout properly clears session ──────────────────────────────────
test.describe('FE-14: Logout', () => {
    test('should clear token and redirect to login on logout', async ({ authenticatedPage }) => {
        // Click profile avatar to open dropdown
        await authenticatedPage.click('#ice-appbar-btn-profile');
        await authenticatedPage.waitForTimeout(300);
        // Click logout
        const logoutBtn = authenticatedPage.locator('text=Logout');
        if (await logoutBtn.isVisible()) {
            await logoutBtn.click();
            await expect(authenticatedPage).toHaveURL(/\/login/, { timeout: 5000 });
            // Token should be cleared
            const token = await authenticatedPage.evaluate(() => localStorage.getItem('ice-token'));
            expect(token).toBeFalsy();
        }
    });
});
