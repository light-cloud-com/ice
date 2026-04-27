export class DeployPageObject {
    page;
    constructor(page) {
        this.page = page;
    }
    get panel() {
        return this.page.locator('[data-testid="deploy-panel"]');
    }
    get deployButton() {
        return this.page.locator('[data-testid="deploy-button"]');
    }
    get status() {
        return this.page.locator('[data-testid="deploy-status"]');
    }
    get log() {
        return this.page.locator('[data-testid="deploy-log"]');
    }
    async selectProject(projectId) {
        await this.page.fill('input[placeholder*="project"]', projectId);
    }
    async clickDeploy() {
        await this.deployButton.click();
    }
    async waitForComplete() {
        await this.page.waitForSelector('[data-testid="deploy-status"]:has-text("success")', {
            timeout: 30_000,
        });
    }
    async getStatus() {
        return this.status.textContent();
    }
}
