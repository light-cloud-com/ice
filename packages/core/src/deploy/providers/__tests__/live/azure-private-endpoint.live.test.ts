/**
 * Azure Private Endpoint live test.
 *
 * Requires a subnet + target service (anything Private Link-eligible).
 * Skips unless AZURE_TEST_PE_SUBNET_ID and AZURE_TEST_PE_TARGET_ID are
 * set. Expected cost: $0.018/hour while it exists; deleted at end.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_TEST_PE_SUBNET_ID=/sub/.../subnets/x \
 *      AZURE_TEST_PE_TARGET_ID=/sub/.../storageAccounts/y \
 *      pnpm test:live:azure private-endpoint
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

azureLive('azure.network.privateEndpoint — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const subnet_id = process.env.AZURE_TEST_PE_SUBNET_ID;
  const target_id = process.env.AZURE_TEST_PE_TARGET_ID;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-private-endpoint');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  if (!subnet_id || !target_id) {
    describe.skip('skipped — set AZURE_TEST_PE_SUBNET_ID + AZURE_TEST_PE_TARGET_ID to test the private endpoint round-trip', () => {
      it('skipped', () => {});
    });
    return;
  }

  it(
    'creates a private endpoint then deletes it',
    async () => {
      const name = uniqueAzureName('icepe', 80);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.privateEndpoint',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            subnet_id,
            private_link_service_id: target_id,
            group_ids: (process.env.AZURE_TEST_PE_GROUP_IDS ?? 'blob').split(','),
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-private-endpoint', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.network.privateEndpoint', name, providerId, {});
      }
    },
    10 * 60_000,
  );
});
