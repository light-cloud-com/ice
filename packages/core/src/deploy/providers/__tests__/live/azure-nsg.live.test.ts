/**
 * Azure Network Security Group live test.
 *
 * Expected runtime: ~30 sec.
 * Expected cost:    free.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure nsg
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

azureLive('azure.network.networkSecurityGroup — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-nsg');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates an NSG then deletes it',
    async () => {
      const name = uniqueAzureName('nsg', 80);
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.networkSecurityGroup',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            rules: [
              {
                name: 'allow-https',
                properties: {
                  priority: 100,
                  direction: 'Inbound',
                  access: 'Allow',
                  protocol: 'Tcp',
                  sourcePortRange: '*',
                  destinationPortRange: '443',
                  sourceAddressPrefix: '*',
                  destinationAddressPrefix: '*',
                },
              },
            ],
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-nsg', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Network\/networkSecurityGroups\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.network.networkSecurityGroup', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-nsg', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
