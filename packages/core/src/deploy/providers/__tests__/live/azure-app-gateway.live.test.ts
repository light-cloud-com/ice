/**
 * Azure Application Gateway live test.
 *
 * Requires a subnet. Skips unless AZURE_TEST_AGW_SUBNET_ID is set
 * (Application Gateway lives inside a dedicated subnet). Expected cost:
 * ~$0.50/hour Standard_v2 (deleted at end).
 *
 * Run: AZURE_TEST_AGW_SUBNET_ID=/sub/.../subnets/x pnpm test:live:azure app-gateway
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AzureLiveContext,
  JsonlLogger,
  TEST_RUN_TAG_KEY,
  azureLive,
  createAzureDeployer,
  testRunTagValue,
  uniqueAzureName,
} from './_live-helpers';

azureLive('azure.network.applicationGateway — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const subnet_id = process.env.AZURE_TEST_AGW_SUBNET_ID;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-app-gateway');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!subnet_id) {
    describe.skip('skipped — set AZURE_TEST_AGW_SUBNET_ID to run the gateway round-trip', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a Standard_v2 gateway then deletes it',
    async () => {
      const name = uniqueAzureName('iceagw', 80);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.applicationGateway',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            subnet_id,
            sku_name: 'Standard_v2',
            sku_tier: 'Standard_v2',
            capacity: 1,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-app-gateway', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.network.applicationGateway', name, providerId, {});
      }
    },
    20 * 60_000,
  );
});
