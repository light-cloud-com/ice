/**
 * Azure Event Grid topic live test.
 * Expected runtime: ~30 sec. Cost: free for empty topic.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure event-grid
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

azureLive('azure.eventgrid.topic — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-event-grid');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a topic then deletes it',
    async () => {
      const name = uniqueAzureName('eg', 50)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.eventgrid.topic',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-event-grid', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.eventgrid.topic', name, providerId, {});
      }
    },
    5 * 60_000,
  );
});
