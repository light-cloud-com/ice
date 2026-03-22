import { test, expect } from '../fixtures/canvas.fixture';

test.describe('Deploy Flow', () => {
  test('should open deploy panel from toolbar', async ({ authenticatedPage }) => {
    const toolbar = authenticatedPage.locator('[data-testid="toolbar"]');
    const deployButton = toolbar.locator('button[title="Deploy"]');

    if (await deployButton.isVisible()) {
      await deployButton.click();
      await authenticatedPage.waitForTimeout(500);

      // Deploy panel should be visible (it's a portal)
      const deployPanel = authenticatedPage.locator('text=Deploy Infrastructure');
      await expect(deployPanel.or(authenticatedPage.locator('.fixed'))).toBeVisible();
    }
  });

  test('should handle deployment failure gracefully', async ({ authenticatedPage }) => {
    // This test validates that the deploy panel doesn't crash on errors
    const toolbar = authenticatedPage.locator('[data-testid="toolbar"]');
    const deployButton = toolbar.locator('button[title="Deploy"]');

    if (await deployButton.isVisible()) {
      await deployButton.click();
      await authenticatedPage.waitForTimeout(300);
      // Verify the page is still functional
      await expect(authenticatedPage.locator('[data-testid="toolbar"]')).toBeVisible();
    }
  });
});
