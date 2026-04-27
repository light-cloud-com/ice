/**
 * Canvas UI helpers for deployment-test scenarios.
 *
 * Higher-level than CanvasHelper in canvas.fixture.ts: addBlock returns the
 * new node's ID by snapshotting before+after, connectBlocks operates on
 * scenario-spec aliases, and getNodes maps id↔iceType for spec validation.
 */
export class CanvasUI {
    page;
    logger;
    constructor(page, logger) {
        this.page = page;
        this.logger = logger;
    }
    // ─── State queries ───────────────────────────────────────────────────────
    async getNodes() {
        const handles = await this.page.locator('[data-node-id]').all();
        const out = [];
        for (const h of handles) {
            const nodeId = await h.getAttribute('data-node-id');
            const iceType = await h.getAttribute('data-ice-type');
            if (nodeId && iceType)
                out.push({ nodeId, iceType });
        }
        return out;
    }
    async getNodeIds() {
        const nodes = await this.getNodes();
        return new Set(nodes.map((n) => n.nodeId));
    }
    // ─── Block placement ──────────────────────────────────────────────────────
    async addBlock(iceType, target = { x: 400, y: 300 }) {
        const before = await this.getNodeIds();
        const paletteItem = this.page.locator(`[data-testid="block-item-${iceType}"]`);
        const canvas = this.page.locator('[data-testid="svg-canvas"]');
        const pBounds = await paletteItem.boundingBox();
        const cBounds = await canvas.boundingBox();
        if (!pBounds)
            throw new Error(`palette item not found: ${iceType}`);
        if (!cBounds)
            throw new Error('svg-canvas not found');
        this.logger.emit({
            kind: 'ui_action',
            action: 'drag',
            selector: `[data-testid="block-item-${iceType}"]`,
            args: { from: 'palette', toCanvas: target },
        });
        await this.page.mouse.move(pBounds.x + pBounds.width / 2, pBounds.y + pBounds.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(cBounds.x + target.x, cBounds.y + target.y, { steps: 10 });
        await this.page.mouse.up();
        // Wait until a new node appears.
        const result = await this.page.waitForFunction((existing) => {
            const els = Array.from(document.querySelectorAll('[data-node-id]'));
            for (const el of els) {
                const id = el.getAttribute('data-node-id');
                const t = el.getAttribute('data-ice-type');
                if (id && t && !existing.includes(id))
                    return { id, t };
            }
            return null;
        }, [...before], { timeout: 8000 });
        const handle = await result.jsonValue();
        if (!handle)
            throw new Error(`addBlock: no new node appeared after drag of ${iceType}`);
        return { nodeId: handle.id, iceType: handle.t };
    }
    async deleteBlock(nodeId) {
        this.logger.emit({ kind: 'ui_action', action: 'click', selector: `[data-node-id="${nodeId}"]` });
        await this.page.locator(`[data-node-id="${nodeId}"]`).click({ force: true });
        await this.page.keyboard.press('Delete');
    }
    async selectBlock(nodeId) {
        this.logger.emit({ kind: 'ui_action', action: 'select', selector: `[data-node-id="${nodeId}"]` });
        const locator = this.page.locator(`[data-node-id="${nodeId}"]`).first();
        // Try a real click first; fall back to dispatchEvent when the node is
        // outside the SVG viewport (large templates often place blocks off-
        // screen and the SVG canvas doesn't support scrollIntoView).
        try {
            await locator.click({ force: true, timeout: 2_000 });
        }
        catch {
            await locator.dispatchEvent('click');
        }
    }
    async connectBlocks(fromNodeId, toNodeId) {
        const sourcePort = this.page.locator(`[data-port-id="${fromNodeId}-right"]`);
        const targetPort = this.page.locator(`[data-port-id="${toNodeId}-left"]`);
        const sBounds = await sourcePort.boundingBox();
        const tBounds = await targetPort.boundingBox();
        if (!sBounds)
            throw new Error(`source port not found: ${fromNodeId}-right`);
        if (!tBounds)
            throw new Error(`target port not found: ${toNodeId}-left`);
        this.logger.emit({
            kind: 'ui_action',
            action: 'drag',
            selector: `[data-port-id="${fromNodeId}-right"]`,
            args: { to: `[data-port-id="${toNodeId}-left"]` },
        });
        await this.page.mouse.move(sBounds.x + sBounds.width / 2, sBounds.y + sBounds.height / 2);
        await this.page.mouse.down();
        await this.page.mouse.move(tBounds.x + tBounds.width / 2, tBounds.y + tBounds.height / 2, { steps: 10 });
        await this.page.mouse.up();
    }
    /** Layout helper: spread blocks on canvas in a horizontal row. */
    laneSlot(index, total) {
        const startX = 220;
        const stepX = 200;
        const y = 240;
        const _ = total; // silence unused
        return { x: startX + index * stepX, y };
    }
}
