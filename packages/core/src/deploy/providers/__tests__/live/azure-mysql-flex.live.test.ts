/**
 * Azure MySQL Flexible Server live test.
 *
 * Expected runtime: 3–5 min.
 * Expected cost:    ~$0.30 (Burstable B1s; deleted at the end).
 *
 * Server name constraints: 3-63 chars, lowercase alphanumeric + hyphens.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure mysql-flex
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

azureLive('azure.mysqlflex.server — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const password = process.env.AZURE_MYSQL_PASSWORD ?? 'IceTest!P@ss123';

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-mysql-flex');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a server then deletes it',
    async () => {
      const name = uniqueAzureName('my', 63)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.mysqlflex.server',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            administrator_login: 'iceadmin',
            administrator_login_password: password,
            sku_name: 'Standard_B1s',
            sku_tier: 'Burstable',
            storage_size_gb: 32,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-mysql-flex', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.DBforMySQL\/flexibleServers\//);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.mysqlflex.server', name, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-mysql-flex', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    15 * 60_000,
  );
});
