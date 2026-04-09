/**
 * GCP Template Integration Suite
 *
 * Tests all (or selected) ICE templates against real GCP infrastructure.
 * Each template is deployed via the UI and verified via gcloud CLI.
 *
 * Required env vars:
 *   ICE_TEST_GCP_PROJECT  — GCP project ID
 *   ICE_TEST_SA_KEY_PATH  — Path to service account key JSON
 *
 * Optional env vars:
 *   ICE_TEST_GCP_REGION   — GCP region (default: us-central1)
 *   ICE_TEST_TEMPLATES    — Comma-separated template IDs, @category, or #difficulty
 */

import { readFileSync } from 'fs';
// Use direct path since workspace packages aren't resolvable as bare specifiers from e2e/
import { ALL_TEMPLATES, type ComposedTemplate } from '../../packages/templates/src/index';
import { test, expect } from '../fixtures/template-deploy.fixture';
import { DeployLogCollector, type TemplateDeployRecord } from '../utils/deploy-log-collector';
import { TemplateTestReporter } from '../utils/template-test-reporter';
import { LiveProgress } from '../utils/live-progress';

// ─── Configuration ─────────────────────────────────────────────────────────

const GCP_PROJECT = process.env.ICE_TEST_GCP_PROJECT || '';
const GCP_REGION = process.env.ICE_TEST_GCP_REGION || 'us-central1';
const SA_KEY_PATH = process.env.ICE_TEST_SA_KEY_PATH || '';
const GITHUB_TOKEN = process.env.ICE_TEST_GITHUB_TOKEN || '';
const OUTPUT_DIR = 'test-results/gcp';

// ─── Template Selection ────────────────────────────────────────────────────

function resolveTemplates(): ComposedTemplate[] {
  const filter = process.env.ICE_TEST_TEMPLATES;
  if (!filter) return ALL_TEMPLATES;

  const ids = filter.split(',').map((s) => s.trim()).filter(Boolean);
  const result: ComposedTemplate[] = [];

  for (const id of ids) {
    if (id.startsWith('@')) {
      // Category filter: @quick-start, @industry, @architecture
      const category = id.slice(1);
      result.push(...ALL_TEMPLATES.filter((t) => t.category === category));
    } else if (id.startsWith('#')) {
      // Difficulty filter: #starter, #intermediate, #advanced
      const difficulty = id.slice(1);
      result.push(...ALL_TEMPLATES.filter((t) => t.difficulty === difficulty));
    } else {
      // Exact template ID match
      const tpl = ALL_TEMPLATES.find((t) => t.id === id);
      if (tpl) result.push(tpl);
    }
  }

  // Deduplicate by ID
  return [...new Map(result.map((t) => [t.id, t])).values()];
}

const TEMPLATES_TO_TEST = resolveTemplates();

// ─── Shared State ──────────────────────────────────────────────────────────

const allRecords: TemplateDeployRecord[] = [];
const progress = new LiveProgress(TEMPLATES_TO_TEST, OUTPUT_DIR);

// ─── Test Suite ────────────────────────────────────────────────────────────

test.describe('GCP Template Integration Suite', () => {
  test.skip(!GCP_PROJECT, 'ICE_TEST_GCP_PROJECT env var required');
  test.skip(!SA_KEY_PATH, 'ICE_TEST_SA_KEY_PATH env var required');

  console.log(`\nTesting ${TEMPLATES_TO_TEST.length} template(s): ${TEMPLATES_TO_TEST.map((t) => t.id).join(', ')}\n`);

  let gcpConnected = false;

  // Each template is its own test
  for (const template of TEMPLATES_TO_TEST) {
    test(`${template.name} [${template.category}]`, async ({ templateDeploy }) => {
      // Connect GCP + GitHub on first test (can't use beforeAll with page fixtures)
      if (!gcpConnected) {
        progress.addLog('Connecting GCP credentials\u2026');
        const saKeyJson = readFileSync(SA_KEY_PATH, 'utf-8');
        await templateDeploy.connectGCPViaUI(saKeyJson);
        progress.addLog('GCP credentials connected');

        if (GITHUB_TOKEN) {
          progress.addLog('Connecting GitHub\u2026');
          await templateDeploy.connectGitHubViaUI(GITHUB_TOKEN);
          progress.addLog('GitHub connected');
        }

        gcpConnected = true;
      }

      const collector = new DeployLogCollector(template, GCP_PROJECT);
      progress.startTemplate(template.id);
      progress.addLog(`Starting: ${template.name}`);

      // ── 1. SELECT TEMPLATE (UI) ──────────────────────────
      progress.startPhase(template.id, 'templateSelect');
      collector.startPhase('templateSelect');
      try {
        await templateDeploy.selectTemplate(template.name);
        collector.addScreenshot('templateSelect', await templateDeploy.screenshot(`${template.id}-01-selected`));
        collector.endPhase('templateSelect', { success: true });
      } catch (err: any) {
        collector.endPhase('templateSelect', { success: false, error: err.message });
        progress.addError(template.id, `Template select failed: ${err.message}`);
        collector.finalize();
        allRecords.push(collector.record);
        progress.completeTemplate(template.id, false, true);
        return;
      }
      progress.endPhase(template.id, 'templateSelect', true, collector.record.phases.templateSelect.duration_ms);

      // ── 2. WAIT FOR CANVAS ────────────────────────────────
      progress.startPhase(template.id, 'canvasLoad');
      collector.startPhase('canvasLoad');
      try {
        const nodeCount = await templateDeploy.waitForCanvasNodes(1);
        progress.addLog(`Canvas loaded: ${nodeCount} nodes`);
        collector.addScreenshot('canvasLoad', await templateDeploy.screenshot(`${template.id}-02-canvas`));
        collector.endPhase('canvasLoad', { success: true });
      } catch (err: any) {
        collector.endPhase('canvasLoad', { success: false, error: err.message });
        collector.finalize();
        allRecords.push(collector.record);
        progress.completeTemplate(template.id, false, true);
        return;
      }
      progress.endPhase(template.id, 'canvasLoad', true, collector.record.phases.canvasLoad.duration_ms);

      // ── 3. OPEN DEPLOY PANEL & CONFIGURE ──────────────────
      progress.addLog('Opening deploy panel\u2026');
      try {
        await templateDeploy.openDeployPanel();
      } catch (err: any) {
        progress.addError(template.id, `Deploy panel failed: ${err.message}`);
        collector.addScreenshot('deploy-panel-fail', await templateDeploy.screenshot(`${template.id}-03-FAIL`));
        collector.finalize();
        allRecords.push(collector.record);
        progress.completeTemplate(template.id, false, true);
        return;
      }
      progress.addLog('Configuring deploy\u2026');
      await templateDeploy.configureDeploy(GCP_PROJECT, GCP_REGION);
      collector.addScreenshot('configure', await templateDeploy.screenshot(`${template.id}-03-configured`));

      // ── 4. PLAN ───────────────────────────────────────────
      progress.startPhase(template.id, 'plan');
      collector.startPhase('plan');
      const planResult = await templateDeploy.plan();
      collector.addScreenshot('plan', await templateDeploy.screenshot(`${template.id}-04-plan`));
      collector.endPhase('plan', { success: planResult.success, error: planResult.error, plan: planResult.plan });
      progress.endPhase(template.id, 'plan', planResult.success, collector.record.phases.plan.duration_ms);

      if (!planResult.success) {
        progress.addLog(`Plan failed: ${planResult.error}`);
        progress.addError(template.id, `Plan failed: ${planResult.error}`);
        collector.captureActionLog(await templateDeploy.captureAndClearActionLog());
        collector.finalize();
        allRecords.push(collector.record);
        await templateDeploy.closeDeployPanel();
        progress.completeTemplate(template.id, false, true);
        return;
      }

      progress.addLog(`Plan succeeded for ${template.name}`);

      // ── 5. DEPLOY ─────────────────────────────────────────
      progress.startPhase(template.id, 'deploy');
      progress.updatePhase(template.id, 'deploying resources...');
      collector.startPhase('deploy');
      const deployResult = await templateDeploy.apply(600_000); // 10 min
      collector.captureDeployLogs(deployResult.logs);

      // Extract and store resource details
      if (deployResult.result?.resources) {
        collector.setResources(deployResult.result.resources);
        const resources = deployResult.result.resources;
        const ok = resources.filter((r: any) => r.success).length;
        const failed = resources.filter((r: any) => !r.success).length;
        progress.setResources(template.id, resources.length, ok, failed);
      }

      collector.addScreenshot('deploy', await templateDeploy.screenshot(`${template.id}-05-deploy`));
      collector.endPhase('deploy', { success: deployResult.success, error: deployResult.error, result: deployResult.result });
      progress.endPhase(template.id, 'deploy', deployResult.success, collector.record.phases.deploy.duration_ms);

      if (deployResult.success) {
        progress.addLog(`Deploy succeeded for ${template.name}`);
      } else {
        progress.addLog(`Deploy failed: ${deployResult.error}`);
        progress.addError(template.id, `Deploy failed: ${deployResult.error}`);
      }

      // ── 6. VERIFY VIA GCLOUD CLI ──────────────────────────
      progress.startPhase(template.id, 'verify');
      collector.startPhase('verify');
      if (deployResult.result?.resources) {
        const successResources = deployResult.result.resources.filter((r: any) => r.success && r.name);
        progress.updatePhase(template.id, `verifying ${successResources.length} resources via gcloud`);
        const verifications = templateDeploy.verifyResources(successResources, GCP_PROJECT, GCP_REGION);
        collector.setVerifications('verify', verifications);

        const verified = verifications.filter((v) => v.exists).length;
        progress.addLog(`Verified: ${verified}/${verifications.length} resources exist in GCP`);
      }
      collector.addScreenshot('verify', await templateDeploy.screenshot(`${template.id}-06-verify`));
      collector.endPhase('verify', { success: true });
      progress.endPhase(template.id, 'verify', true, collector.record.phases.verify.duration_ms);

      // ── 7. DESTROY ────────────────────────────────────────
      progress.startPhase(template.id, 'destroy');
      collector.startPhase('destroy');
      const destroyResult = await templateDeploy.destroy(300_000); // 5 min
      collector.addScreenshot('destroy', await templateDeploy.screenshot(`${template.id}-07-destroy`));
      collector.endPhase('destroy', { success: destroyResult.success, error: destroyResult.error });
      progress.endPhase(template.id, 'destroy', destroyResult.success, collector.record.phases.destroy.duration_ms);

      if (destroyResult.success) {
        progress.addLog(`Destroy succeeded for ${template.name}`);
      } else {
        progress.addLog(`Destroy failed: ${destroyResult.error}`);
      }

      // ── 8. VERIFY REMOVAL ─────────────────────────────────
      progress.startPhase(template.id, 'verifyRemoval');
      collector.startPhase('verifyRemoval');
      // Wait for GCP propagation
      await new Promise((r) => setTimeout(r, 5000));

      if (deployResult.result?.resources) {
        const successResources = deployResult.result.resources.filter((r: any) => r.success && r.name);
        const verifications = templateDeploy.verifyResources(successResources, GCP_PROJECT, GCP_REGION);
        collector.setVerifications('verifyRemoval', verifications);

        const stillExists = verifications.filter((v) => v.exists).length;
        if (stillExists > 0) {
          progress.addLog(`Warning: ${stillExists} resources still exist after destroy`);
        } else {
          progress.addLog('All resources confirmed removed');
        }
      }
      collector.endPhase('verifyRemoval', { success: true });
      progress.endPhase(template.id, 'verifyRemoval', true, collector.record.phases.verifyRemoval.duration_ms);

      // ── 9. COLLECT LOGS & FINALIZE ────────────────────────
      collector.captureActionLog(await templateDeploy.captureAndClearActionLog());
      collector.finalize();
      allRecords.push(collector.record);

      const hasErrors = collector.record.errors.length > 0;
      progress.completeTemplate(template.id, collector.record.overallSuccess, hasErrors);

      // Clean up for next template
      await templateDeploy.resetForNextTemplate();
    });
  }

  // Generate aggregate report after all templates
  test.afterAll(async () => {
    if (allRecords.length === 0) return;

    progress.complete();

    const reporter = new TemplateTestReporter(allRecords, {
      gcpProject: GCP_PROJECT,
      region: GCP_REGION,
    });
    const { htmlPath, jsonPath } = await reporter.generate(OUTPUT_DIR);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  GCP Template Test Report`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Templates: ${allRecords.length}`);
    console.log(`  Passed:    ${allRecords.filter((r) => r.overallSuccess && r.errors.length === 0).length}`);
    console.log(`  Failed:    ${allRecords.filter((r) => !r.overallSuccess).length}`);
    console.log(`  HTML:      ${htmlPath}`);
    console.log(`  JSON:      ${jsonPath}`);
    console.log(`${'='.repeat(60)}\n`);
  });
});
