/**
 * Azure Cache for Redis live test.
 *
 * Expected runtime: 15–25 min (Azure quirk — Redis provisioning is slow).
 * Expected cost:    ~$0.02 (Basic C0; deleted at the end).
 *
 * Cache name constraints: 1-63 chars, alphanumeric + hyphens.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure redis-cache
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

azureLive('azure.cache.redis — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-redis-cache');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a cache then deletes it',
    async () => {
      const name = uniqueAzureName('redis', 63)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.cache.redis',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: 'Basic',
            sku_family: 'C',
            sku_capacity: 0,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-redis-cache', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Cache\/Redis\//i);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.cache.redis', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-redis-cache', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    30 * 60_000,
  );
});
