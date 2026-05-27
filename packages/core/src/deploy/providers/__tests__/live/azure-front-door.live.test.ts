/**
 * Azure Front Door (Standard) live test.
 * Expected runtime: 2–4 min. Cost: ~$0.02/hour Standard (deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... pnpm test:live:azure front-door
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

azureLive('azure.network.frontDoor — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-front-door');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Standard AFD profile then deletes it',
    async () => {
      const name = uniqueAzureName('icefd', 60);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.frontDoor',
          name,
          {
            resource_group: ctx.resourceGroup,
            sku_name: 'Standard_AzureFrontDoor',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-front-door', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.network.frontDoor', name, providerId, {});
      }
    },
    15 * 60_000,
  );
});
