/**
 * Azure App Service Plan live test. (The Web App handler is already
 * covered by `azure-web-app.live.test.ts`.)
 *
 * Expected runtime: ~1 min. Cost: free (F1 Free tier).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure app-service
 */

import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.web.appServicePlan — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-app-service');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an F1 plan then deletes it',
    async () => {
      const name = uniqueAzureName('iceasp', 40);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.web.appServicePlan',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            tier: 'F1',
            capacity: 1,
            reserved: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-app-service', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.web.appServicePlan', name, providerId, {});
      }
    },
    5 * 60_000,
  );
});
