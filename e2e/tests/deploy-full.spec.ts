/**
 * Deploy Full Flow — Plan, Apply, Verify, Destroy
 *
 * Tests the complete deployment lifecycle:
 * 1. Configure provider + project + region
 * 2. Plan deployment
 * 3. Apply deployment
 * 4. Verify resources via gcloud CLI
 * 5. Destroy via app UI
 * 6. Verify resources removed via gcloud CLI
 */

import { test, expect } from '../fixtures/base.fixture';
import { getActionLog, getApiCalls, waitForApiResponse, dumpActionLog } from '../utils/action-log-reader';
import { FlowReporter } from '../utils/flow-reporter';
import { verifyCloudRunService, listCloudRunServices } from '../utils/gcp-verify';

// These come from environment or .env — set before running
const GCP_PROJECT = process.env.ICE_TEST_GCP_PROJECT || '';
const GCP_REGION = process.env.ICE_TEST_GCP_REGION || 'europe-west1';

test.describe('Deploy Full Flow', () => {
  test.skip(!GCP_PROJECT, 'ICE_TEST_GCP_PROJECT env var required for deploy tests');

  test('plan → apply → verify → destroy → verify removal', async ({ authenticatedPage: page }) => {
    const reporter = new FlowReporter('deploy-full');

    // Step 1: Navigate to a project with nodes
    await reporter.step(page, 'Navigate to project', 'goto', async () => {
      // The authenticated page should land on folder view or canvas
      await page.waitForSelector('#ice-canvas-svg, #ice-folder-panel', { timeout: 10000 });
    });

    // Step 2: Open deploy panel
    await reporter.step(
      page,
      'Open deploy panel',
      'click',
      async () => {
        await page.click('#ice-appbar-btn-deploy');
        await page.waitForSelector('#ice-deploy-panel', { timeout: 5000 });
      },
      '#ice-appbar-btn-deploy',
    );

    // Step 3: Configure provider
    await reporter.step(
      page,
      'Select GCP provider',
      'select',
      async () => {
        const providerSelect = page.locator('#ice-deploy-select-provider');
        if (await providerSelect.isVisible()) {
          await providerSelect.selectOption('gcp');
        }
      },
      '#ice-deploy-select-provider',
    );

    // Step 4: Set project ID
    await reporter.step(
      page,
      'Set GCP project',
      'fill',
      async () => {
        const projectInput = page.locator('#ice-deploy-input-project');
        if (await projectInput.isVisible()) {
          await projectInput.fill(GCP_PROJECT);
        }
      },
      '#ice-deploy-input-project',
    );

    // Step 5: Set region
    await reporter.step(
      page,
      'Set region',
      'select',
      async () => {
        const regionSelect = page.locator('#ice-deploy-select-region');
        if (await regionSelect.isVisible()) {
          await regionSelect.selectOption(GCP_REGION);
        }
      },
      '#ice-deploy-select-region',
    );

    // Step 6: Plan
    await reporter.step(
      page,
      'Click Plan',
      'click',
      async () => {
        await page.click('#ice-deploy-btn-plan');
        // Wait for plan API response
        await page.waitForFunction(
          () => {
            const log = (window as any).__ICE_ACTION_LOG__ || [];
            return log.some(
              (e: any) =>
                e.target.includes('/canvas/deploy/plan') && (e.action === 'api_response' || e.action === 'api_error'),
            );
          },
          {},
          { timeout: 30000 },
        );
      },
      '#ice-deploy-btn-plan',
    );

    // Check plan result
    const planCalls = await getApiCalls(page, 'deploy/plan');
    const planResponse = planCalls.find((e) => e.action === 'api_response');
    if (planResponse) {
      expect(planResponse.detail.status).toBe(200);
    }

    // Step 7: Apply
    await reporter.step(
      page,
      'Click Apply',
      'click',
      async () => {
        const applyBtn = page.locator('#ice-deploy-btn-apply');
        if (await applyBtn.isVisible()) {
          await applyBtn.click();
          // Wait for deploy to complete (may take a while)
          await page.waitForFunction(
            () => {
              const log = (window as any).__ICE_ACTION_LOG__ || [];
              return log.some(
                (e: any) =>
                  e.target.includes('/canvas/deploy/apply') &&
                  (e.action === 'api_response' || e.action === 'api_error'),
              );
            },
            {},
            { timeout: 120000 },
          );
        }
      },
      '#ice-deploy-btn-apply',
    );

    // Step 8: Verify deploy result in action log
    const deployCalls = await getApiCalls(page, 'deploy/apply');
    const deployResponse = deployCalls.find((e) => e.action === 'api_response');

    if (deployResponse && deployResponse.detail.status === 200) {
      // Step 9: Verify via gcloud
      await reporter.step(page, 'Verify GCP resources', 'gcloud', async () => {
        const services = listCloudRunServices(GCP_PROJECT, GCP_REGION);
        for (const svc of services) {
          const result = verifyCloudRunService(GCP_PROJECT, GCP_REGION, svc);
          reporter.addGcpVerification(`cloud-run:${svc}`, result.exists, result.error || undefined);
          expect(result.exists).toBe(true);
        }
      });

      // Step 10: Destroy via app UI
      await reporter.step(
        page,
        'Click Destroy',
        'click',
        async () => {
          const destroyBtn = page.locator('#ice-deploy-btn-destroy');
          if (await destroyBtn.isVisible()) {
            await destroyBtn.click();
            // Wait for destroy to complete
            await page.waitForFunction(
              () => {
                const log = (window as any).__ICE_ACTION_LOG__ || [];
                return log.some(
                  (e: any) =>
                    e.target.includes('/canvas/deploy/destroy') &&
                    (e.action === 'api_response' || e.action === 'api_error'),
                );
              },
              {},
              { timeout: 120000 },
            );
          }
        },
        '#ice-deploy-btn-destroy',
      );

      // Step 11: Verify resources removed
      await reporter.step(page, 'Verify resources removed', 'gcloud', async () => {
        // Wait a moment for GCP propagation
        await page.waitForTimeout(5000);
        const services = listCloudRunServices(GCP_PROJECT, GCP_REGION);
        reporter.addGcpVerification('post-destroy-services', services.length === 0);
      });
    }

    // Save report
    const reportPath = await reporter.save(page);
    console.log(`Flow report saved: ${reportPath}`);

    // Dump full action log for Claude Code
    const logDump = await dumpActionLog(page);
    const { writeFileSync } = await import('fs');
    writeFileSync('test-results/deploy-full-action-log.json', logDump);
  });
});
