/**
 * Azure Log Analytics workspace live test.
 * Expected runtime: ~30 sec. Cost: free with 0 GB ingested.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure log-analytics
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

azureLive('azure.monitor.logAnalytics — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-log-analytics');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a workspace then deletes it',
    async () => {
      const name = uniqueAzureName('icela', 63);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.monitor.logAnalytics',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku: 'PerGB2018',
            retention_days: 30,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-log-analytics', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.monitor.logAnalytics', name, providerId, {});
      }
    },
    5 * 60_000,
  );
});
