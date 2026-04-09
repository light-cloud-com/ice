/**
 * Canvas Fixture — Canvas interaction helpers
 *
 * Extends base fixture with drag/drop, connect, zoom helpers.
 * Creates a project via UI navigation (no API calls).
 */

import { type Page } from '@playwright/test';
import { test as base, expect } from './base.fixture';

export const test = base.extend<{
  canvas: CanvasHelper;
  authenticatedPage: Page;
}>({
  authenticatedPage: async ({ authenticatedPage }, use) => {
    // Community edition auto-seeds user, lands on folder view or canvas
    // Wait for the app to load
    await authenticatedPage.waitForSelector(
      '[data-testid="svg-canvas"], #ice-folder-panel, #ice-canvas-svg',
      { timeout: 15000 },
    );

    // If we're on the folder view, create a new project via UI
    const onCanvas = await authenticatedPage.locator('[data-testid="svg-canvas"], #ice-canvas-svg').isVisible();
    if (!onCanvas) {
      // Click "New Project" button if visible
      const newProjectBtn = authenticatedPage.locator(
        'button:has-text("New Project"), button:has-text("Create"), [data-testid="new-project"]',
      );
      if (await newProjectBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await newProjectBtn.first().click();
        await authenticatedPage.waitForTimeout(1000);
      }

      // Wait for canvas to appear after project creation
      await authenticatedPage
        .locator('[data-testid="svg-canvas"], #ice-canvas-svg')
        .waitFor({ state: 'visible', timeout: 15000 });
    }

    await use(authenticatedPage);
  },

  canvas: async ({ authenticatedPage }, use) => {
    const helper = new CanvasHelper(authenticatedPage);
    await use(helper);
  },
});

export class CanvasHelper {
  constructor(private page: Page) {}

  /** Drag a block from the palette to a canvas position */
  async dragFromPalette(blockType: string, targetX: number, targetY: number) {
    const paletteItem = this.page.locator(`[data-testid="block-item-${blockType}"]`);
    const canvas = this.page.locator('[data-testid="svg-canvas"]');

    const paletteBounds = await paletteItem.boundingBox();
    const canvasBounds = await canvas.boundingBox();

    if (!paletteBounds || !canvasBounds) {
      throw new Error('Could not find palette item or canvas');
    }

    await this.page.mouse.move(paletteBounds.x + paletteBounds.width / 2, paletteBounds.y + paletteBounds.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(canvasBounds.x + targetX, canvasBounds.y + targetY, {
      steps: 10,
    });
    await this.page.mouse.up();
  }

  /** Get all node elements on the canvas */
  async getCanvasNodes() {
    return this.page.locator('[data-node-id]').all();
  }

  /** Get a specific node by its ID */
  async getNode(nodeId: string) {
    return this.page.locator(`[data-node-id="${nodeId}"]`);
  }

  /** Connect two nodes via their ports */
  async connectNodes(sourceId: string, targetId: string) {
    const sourcePort = this.page.locator(`[data-port-id="${sourceId}-right"]`);
    const targetPort = this.page.locator(`[data-port-id="${targetId}-left"]`);

    const sourceBounds = await sourcePort.boundingBox();
    const targetBounds = await targetPort.boundingBox();

    if (!sourceBounds || !targetBounds) {
      throw new Error('Could not find source or target port');
    }

    await this.page.mouse.move(sourceBounds.x + sourceBounds.width / 2, sourceBounds.y + sourceBounds.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(targetBounds.x + targetBounds.width / 2, targetBounds.y + targetBounds.height / 2, {
      steps: 10,
    });
    await this.page.mouse.up();
  }

  /** Delete a node by selecting and pressing Delete */
  async deleteNode(nodeId: string) {
    const node = this.page.locator(`[data-node-id="${nodeId}"]`);
    await node.click();
    await this.page.keyboard.press('Delete');
  }

  /** Pan the canvas */
  async pan(deltaX: number, deltaY: number) {
    const canvas = this.page.locator('[data-testid="svg-canvas"]');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;

    await this.page.mouse.move(cx, cy);
    await this.page.mouse.down({ button: 'middle' });
    await this.page.mouse.move(cx + deltaX, cy + deltaY, { steps: 5 });
    await this.page.mouse.up({ button: 'middle' });
  }

  /** Zoom the canvas */
  async zoom(delta: number) {
    const canvas = this.page.locator('[data-testid="svg-canvas"]');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Canvas not found');

    await this.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await this.page.mouse.wheel(0, delta);
  }
}

export { expect };
