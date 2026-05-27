/**
 * Azure Container Registry live test.
 *
 * Expected runtime: 1–2 min.
 * Expected cost:    ~$0.17/day for Basic (deleted at end → fractions of a cent).
 *
 * Registry name constraints: 5-50 chars, alphanumeric only (no hyphens), globally unique.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure acr
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

azureLive('azure.containerregistry.registry — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-acr');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a Basic registry then deletes it',
    async () => {
      // Registry names must be alphanumeric (no hyphens), globally unique.
      const name = uniqueAzureName('iceacr', 50)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.containerregistry.registry',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            sku_name: 'Basic',
            admin_user_enabled: false,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-acr', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.ContainerRegistry\/registries\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.containerregistry.registry', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-acr', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
