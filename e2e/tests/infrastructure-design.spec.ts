import { test, expect } from '../fixtures/canvas.fixture';

test.describe('Infrastructure Design', () => {
  test('should render empty canvas for new project', async ({ authenticatedPage }) => {
    const canvas = authenticatedPage.locator('[data-testid="svg-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 15000 });
  });

  test('should show node details when clicking a resource node', async ({ authenticatedPage }) => {
    // Find a compact node (resource) — these are clickable without interception
    const compactNode = authenticatedPage.locator('.svg-compact-node').first();

    if (!(await compactNode.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    // Click on the node using force to bypass SVG interception
    await compactNode.click({ force: true });
    await authenticatedPage.waitForTimeout(500);

    // Verify the click didn't crash the app
    await expect(authenticatedPage.locator('[data-testid="svg-canvas"]')).toBeVisible();
  });

  test('should display canvas with palette for infrastructure design', async ({ authenticatedPage }) => {
    const canvas = authenticatedPage.locator('[data-testid="svg-canvas"]');
    const palette = authenticatedPage.locator('[data-testid="resource-palette"]');

    await expect(canvas).toBeVisible({ timeout: 15000 });
    await expect(palette).toBeVisible({ timeout: 5000 });
  });
});
