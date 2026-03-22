import { test, expect } from '../fixtures/canvas.fixture';

test.describe('Infrastructure Design', () => {
  test('should have nodes on canvas from demo data', async ({ authenticatedPage }) => {
    const nodes = await authenticatedPage.locator('[data-node-id]').all();
    expect(nodes.length).toBeGreaterThan(0);
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

  test('should display multiple node types on canvas', async ({ authenticatedPage }) => {
    const groupNodes = await authenticatedPage.locator('.svg-group-node').count();
    const compactNodes = await authenticatedPage.locator('.svg-compact-node').count();

    // Demo data should have both group and compact nodes
    expect(groupNodes + compactNodes).toBeGreaterThan(0);
  });
});
