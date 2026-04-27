/**
 * Canvas Fixture — Canvas interaction helpers
 *
 * Extends base fixture with drag/drop, connect, zoom helpers.
 * Creates a project via UI navigation (no API calls).
 */
import { type Page } from '@playwright/test';
import { expect } from './base.fixture';
export declare const test: any;
export declare class CanvasHelper {
    private page;
    constructor(page: Page);
    /** Drag a block from the palette to a canvas position */
    dragFromPalette(blockType: string, targetX: number, targetY: number): Promise<void>;
    /** Get all node elements on the canvas */
    getCanvasNodes(): Promise<import("@playwright/test").Locator[]>;
    /** Get a specific node by its ID */
    getNode(nodeId: string): Promise<import("@playwright/test").Locator>;
    /** Connect two nodes via their ports */
    connectNodes(sourceId: string, targetId: string): Promise<void>;
    /** Delete a node by selecting and pressing Delete */
    deleteNode(nodeId: string): Promise<void>;
    /** Pan the canvas */
    pan(deltaX: number, deltaY: number): Promise<void>;
    /** Zoom the canvas */
    zoom(delta: number): Promise<void>;
}
export { expect };
