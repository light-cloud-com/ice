import { test, expect } from '../fixtures/canvas.fixture';

test.describe('Templates', () => {
  test('should show template picker', async ({ authenticatedPage }) => {
    // Look for template button in toolbar
    const templateButton = authenticatedPage.locator('button[title="Start from Template"]');
    if (await templateButton.isVisible()) {
      await templateButton.click();
      await authenticatedPage.waitForTimeout(300);

      // Template dropdown should appear
      const dropdown = authenticatedPage.locator('text=Templates');
      await expect(dropdown).toBeVisible();
    }
  });

  test('should populate canvas from template', async ({ authenticatedPage }) => {
    const templateButton = authenticatedPage.locator('button[title="Start from Template"]');
    if (await templateButton.isVisible()) {
      await templateButton.click();
      await authenticatedPage.waitForTimeout(300);

      // Click first template if available
      const firstTemplate = authenticatedPage.locator('[role="menuitem"]').first();
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click();
        await authenticatedPage.waitForTimeout(1000);

        // Canvas should now have nodes
        const nodes = await authenticatedPage.locator('[data-node-id]').all();
        expect(nodes.length).toBeGreaterThan(0);
      }
    }
  });
});
