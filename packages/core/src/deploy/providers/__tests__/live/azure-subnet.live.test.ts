/**
 * Azure Subnet live test.
 *
 * Creates a vnet first, then a subnet inside it. Both are cleaned up.
 * Expected runtime: ~1 min. Cost: free.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure subnet
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

azureLive('azure.network.subnet — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-subnet');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a vnet + subnet then deletes both',
    async () => {
      const vnet_name = uniqueAzureName('snvnet', 64);
      const sn_name = uniqueAzureName('sn', 80);
      let vnet_id: string | undefined;
      let sn_id: string | undefined;
      try {
        const v = await ctx.deployer.create(
          'azure.network.virtualNetwork',
          vnet_name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            address_prefixes: ['10.60.0.0/16'],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-subnet-vnet', result: v });
        expect(v.success).toBe(true);
        vnet_id = v.provider_id;

        const s = await ctx.deployer.create(
          'azure.network.subnet',
          sn_name,
          {
            resource_group: ctx.resourceGroup,
            virtual_network_name: vnet_name,
            cidr_block: '10.60.1.0/24',
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-subnet', result: s });
        expect(s.success).toBe(true);
        sn_id = s.provider_id;
      } finally {
        if (sn_id) await ctx.deployer.delete('azure.network.subnet', sn_name, sn_id, {});
        if (vnet_id) await ctx.deployer.delete('azure.network.virtualNetwork', vnet_name, vnet_id, {});
      }
    },
    10 * 60_000,
  );
});
