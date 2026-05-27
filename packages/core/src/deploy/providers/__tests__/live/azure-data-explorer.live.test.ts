/**
 * Azure Data Explorer (Kusto) live test.
 *
 * Expected runtime: 5–15 min. Cost: ~$0.40/hour for Dev SKU (deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure data-explorer
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

azureLive('azure.kusto.cluster — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-data-explorer');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Dev-tier cluster then deletes it',
    async () => {
      const name = uniqueAzureName('icek', 22)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.kusto.cluster',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: 'Dev(No SLA)_Standard_E2a_v4',
            sku_tier: 'Basic',
            sku_capacity: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-data-explorer', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.kusto.cluster', name, providerId, {});
      }
    },
    30 * 60_000,
  );
});
