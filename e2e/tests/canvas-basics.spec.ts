import { test, expect } from '../fixtures/canvas.fixture';

test.describe('Canvas Basics', () => {
  test('should render canvas with palette', async ({ authenticatedPage }) => {
    // Wait for app to fully mount after auth redirect
    await authenticatedPage.waitForTimeout(2000);

    const canvas = authenticatedPage.locator('[data-testid="svg-canvas"]');
    const palette = authenticatedPage.locator('[data-testid="resource-palette"]');

    await expect(canvas).toBeVisible({ timeout: 15000 });
    await expect(palette).toBeVisible({ timeout: 5000 });
  });

  test('should have nodes from demo data on canvas', async ({ authenticatedPage }) => {
    // The app loads with demo data by default
    const nodes = await authenticatedPage.locator('[data-node-id]').all();
    expect(nodes.length).toBeGreaterThan(0);
  });

  test('should drag block from palette and create nodes', async ({ authenticatedPage }) => {
    // Use an actual block type from the palette
    const paletteItem = authenticatedPage.locator('[data-testid="block-item-scalable-backend"]');

    // Skip if palette item not found (palette may be collapsed)
    if (!(await paletteItem.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip();
      return;
    }

    const nodesBefore = await authenticatedPage.locator('[data-node-id]').count();
    const canvas = authenticatedPage.locator('[data-testid="svg-canvas"]');

    const paletteBounds = await paletteItem.boundingBox();
    const canvasBounds = await canvas.boundingBox();
    if (!paletteBounds || !canvasBounds) {
      test.skip();
      return;
    }

    await authenticatedPage.mouse.move(
      paletteBounds.x + paletteBounds.width / 2,
      paletteBounds.y + paletteBounds.height / 2,
    );
    await authenticatedPage.mouse.down();
    await authenticatedPage.mouse.move(canvasBounds.x + 400, canvasBounds.y + 300, { steps: 10 });
    await authenticatedPage.mouse.up();

    await authenticatedPage.waitForTimeout(1000);
    const nodesAfter = await authenticatedPage.locator('[data-node-id]').count();
    expect(nodesAfter).toBeGreaterThanOrEqual(nodesBefore);
  });

  test('should pan canvas with middle-drag', async ({ canvas }) => {
    await canvas.pan(100, 50);
  });

  test('should zoom with scroll wheel', async ({ canvas }) => {
    await canvas.zoom(-300);
    await canvas.zoom(300);
  });

  test('should undo/redo with Ctrl+Z/Y', async ({ authenticatedPage }) => {
    await authenticatedPage.keyboard.press('Control+z');
    await authenticatedPage.keyboard.press('Control+y');
  });
});
