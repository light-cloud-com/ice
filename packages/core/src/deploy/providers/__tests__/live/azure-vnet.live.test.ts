/**
 * Azure Virtual Network live test.
 *
 * Expected runtime: ~30 sec.
 * Expected cost:    free (no charge for the vnet itself; deleted at the end).
 *
 * VNet name constraints: 2-64 chars, alphanumeric + hyphens + underscores + periods.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure vnet
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

azureLive('azure.network.virtualNetwork — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-vnet');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a vnet then deletes it',
    async () => {
      const name = uniqueAzureName('vnet', 64);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.virtualNetwork',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            address_prefixes: ['10.50.0.0/16'],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-vnet', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Network\/virtualNetworks\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.network.virtualNetwork', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-vnet', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
