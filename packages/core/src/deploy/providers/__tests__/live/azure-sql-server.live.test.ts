/**
 * Azure SQL Server (logical) live test.
 * Expected runtime: 1–2 min. Cost: ~free for empty server (deleted at end).
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus pnpm test:live:azure sql-server
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

azureLive('azure.sql.server — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;
  const password = process.env.AZURE_SQL_PASSWORD ?? 'IceTest!P@ss123';

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-sql-server');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a SQL server then deletes it',
    async () => {
      const name = uniqueAzureName('icesql', 63)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.sql.server',
          name,
          {
            location: ctx.location,
            resource_group: ctx.resourceGroup,
            administrator_login: 'iceadmin',
            administrator_login_password: password,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-sql-server', result: r });
        expect(r.success).toBe(true);
        providerId = r.provider_id;
      } finally {
        if (providerId) await ctx.deployer.delete('azure.sql.server', name, providerId, {});
      }
    },
    10 * 60_000,
  );
});
