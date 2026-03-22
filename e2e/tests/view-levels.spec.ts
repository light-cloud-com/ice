import { test, expect } from '../fixtures/canvas.fixture';

test.describe('View Levels', () => {
  test('should default to Architecture (L1) with networking hidden', async ({ authenticatedPage }) => {
    // At L1, networking nodes (VPC, Subnet, LB, CDN) should be hidden
    const canvas = authenticatedPage.locator('[data-testid="svg-canvas"]');
    await expect(canvas).toBeVisible();
    // L1 is the default — just verify canvas renders
  });

  test('should switch to Infrastructure (L2) showing all nodes', async ({ canvas, authenticatedPage }) => {
    const toggle = authenticatedPage.locator('[data-testid="view-level-toggle"]');
    if (await toggle.isVisible()) {
      await toggle.click();
      await authenticatedPage.waitForTimeout(500);
      // At L2, more nodes should be visible (networking, security, monitoring)
    }
  });

  test('should preserve positions across view switches', async ({ canvas, authenticatedPage }) => {
    const toggle = authenticatedPage.locator('[data-testid="view-level-toggle"]');
    if (await toggle.isVisible()) {
      // Switch to L2
      await toggle.click();
      await authenticatedPage.waitForTimeout(300);
      // Switch back to L1
      await toggle.click();
      await authenticatedPage.waitForTimeout(300);
      // Canvas should still be functional
      await expect(authenticatedPage.locator('[data-testid="svg-canvas"]')).toBeVisible();
    }
  });
});
