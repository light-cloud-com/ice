export class CanvasPageObject {
    page;
    constructor(page) {
        this.page = page;
    }
    get canvas() {
        return this.page.locator('[data-testid="svg-canvas"]');
    }
    get palette() {
        return this.page.locator('[data-testid="resource-palette"]');
    }
    get toolbar() {
        return this.page.locator('[data-testid="toolbar"]');
    }
    async goto(projectId) {
        await this.page.goto(projectId ? `/project/${projectId}` : '/');
    }
    async waitForReady() {
        await this.canvas.waitFor({ state: 'visible' });
    }
    async getNodeByType(iceType) {
        return this.page.locator(`[data-node-id][data-ice-type="${iceType}"]`);
    }
    async getAllNodes() {
        return this.page.locator('[data-node-id]').all();
    }
    async openDeployPanel() {
        await this.toolbar.locator('button[title="Deploy"]').click();
    }
}
