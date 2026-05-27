/**
 * Azure Event Hubs live test.
 *
 * Expected runtime: 1–2 min.
 * Expected cost:    ~$0.03/hour for Standard (deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure event-hubs
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

azureLive('azure.eventhub.namespace — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-event-hubs');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a namespace then deletes it',
    async () => {
      const name = uniqueAzureName('eh', 50)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.eventhub.namespace',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: 'Standard',
            sku_capacity: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-event-hubs', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.EventHub\/namespaces\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.eventhub.namespace', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-event-hubs', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
