/**
 * Azure Cosmos DB live test.
 *
 * Expected runtime: 3–7 min. Cost: free under serverless tier with no
 * throughput consumed (deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure cosmosdb
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

azureLive('azure.cosmosdb.account — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-cosmosdb');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Cosmos account then deletes it',
    async () => {
      const name = uniqueAzureName('icecdb', 44)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.cosmosdb.account',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            kind: 'GlobalDocumentDB',
            consistency_level: 'Session',
            serverless: true,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-cosmosdb', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.cosmosdb.account', name, providerId, {});
      }
    },
    20 * 60_000,
  );
});
