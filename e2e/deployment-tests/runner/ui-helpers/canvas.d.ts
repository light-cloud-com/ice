/**
 * Canvas UI helpers for deployment-test scenarios.
 *
 * Higher-level than CanvasHelper in canvas.fixture.ts: addBlock returns the
 * new node's ID by snapshotting before+after, connectBlocks operates on
 * scenario-spec aliases, and getNodes maps id↔iceType for spec validation.
 */
import type { Page } from '@playwright/test';
import type { RunLogger } from '../logger/run-logger';
interface AddBlockResult {
    nodeId: string;
    iceType: string;
}
export declare class CanvasUI {
    private page;
    private logger;
    constructor(page: Page, logger: RunLogger);
    getNodes(): Promise<Array<{
        nodeId: string;
        iceType: string;
    }>>;
    getNodeIds(): Promise<Set<string>>;
    addBlock(iceType: string, target?: {
        x: number;
        y: number;
    }): Promise<AddBlockResult>;
    deleteBlock(nodeId: string): Promise<void>;
    selectBlock(nodeId: string): Promise<void>;
    connectBlocks(fromNodeId: string, toNodeId: string): Promise<void>;
    /** Layout helper: spread blocks on canvas in a horizontal row. */
    laneSlot(index: number, total: number): {
        x: number;
        y: number;
    };
}
export {};
