/**
 * Azure Cognitive Search live test.
 *
 * Expected runtime: 1–2 min (Free tier allocates fast).
 * Expected cost:    free (Free SKU; deleted at the end).
 *
 * Free tier: 1 service per subscription region. If your subscription
 * already has one, the test fails with a quota error — flip to Basic
 * (AZURE_SEARCH_SKU=basic) for an additional ~$0.10/hour.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure cognitive-search
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

azureLive('azure.search.service — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-cognitive-search');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a service then deletes it',
    async () => {
      const name = uniqueAzureName('icesrch', 60)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.search.service',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: process.env.AZURE_SEARCH_SKU ?? 'free',
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-cognitive-search', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Search\/searchServices\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.search.service', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-cognitive-search', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    10 * 60_000,
  );
});
