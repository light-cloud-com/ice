/**
 * Azure Web App (App Service) live test.
 *
 * Expected runtime: 1–3 min.
 * Expected cost:    free (F1 tier).
 *
 * One-time setup:
 *   - Web Apps live on an App Service Plan. Create one in F1 (Free) tier:
 *
 *       az appservice plan create -g ice-test-rg -n ice-test-asp \
 *         --is-linux --sku F1
 *       az appservice plan show -g ice-test-rg -n ice-test-asp --query id -o tsv
 *
 *   - export AZURE_TEST_APP_SERVICE_PLAN_ID=<id printed above>
 *
 * Run:
 *   pnpm test:live:azure web-app
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.web.app — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const planId = process.env.AZURE_TEST_APP_SERVICE_PLAN_ID;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-web-app');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!planId) {
    describe.skip('skipped — set AZURE_TEST_APP_SERVICE_PLAN_ID to an existing App Service Plan id', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a web app on F1 then deletes it',
    async () => {
      const name = uniqueAzureName('webapp', 60);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.web.app',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            app_service_plan_id: planId,
            linux_fx_version: 'NODE|20-lts',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-web-app', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Web\/sites\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.web.app', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-web-app', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
