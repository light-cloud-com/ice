/**
 * Azure DNS Zone live test.
 *
 * Expected runtime: ~30 sec.
 * Expected cost:    ~$0.50/month (deleted at end → fractions of a cent).
 *
 * Zone name MUST be a valid DNS-FQDN owned by you (or an `example.com`
 * subdomain you control). The test does NOT register a real domain —
 * supply AZURE_TEST_DNS_ZONE if you need a specific one.
 *
 * Run: AZURE_SUBSCRIPTION_ID=... AZURE_LOCATION=eastus AZURE_TEST_DNS_ZONE=ice-test.example pnpm test:live:azure dns-zone
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

azureLive('azure.network.dnsZone — create + delete', () => {
  let ctx: AzureLiveContext;
  let logger: JsonlLogger;

  beforeAll(async () => {
    ctx = await createAzureDeployer();
    logger = new JsonlLogger('azure-dns-zone');
  });
  afterAll(async () => {
    await ctx.deployer.cleanup();
    logger.close();
  });

  it(
    'creates a zone then deletes it',
    async () => {
      const zoneName = process.env.AZURE_TEST_DNS_ZONE ?? `ice-${uniqueAzureName('z', 32).toLowerCase()}.example`;
      let providerId: string | undefined;
      try {
        const r = await ctx.deployer.create(
          'azure.network.dnsZone',
          zoneName,
          {
            resource_group: ctx.resourceGroup,
            zone_name: zoneName,
            tags: { [TEST_RUN_TAG_KEY]: testRunTagValue() },
          },
          {},
        );
        logger.log({ kind: 'create', handler: 'azure-dns-zone', result: r });
        expect(r.success).toBe(true);
        expect(r.provider_id).toMatch(/\/providers\/Microsoft\.Network\/dnszones\//i);
        providerId = r.provider_id;
      } finally {
        if (providerId) {
          const d = await ctx.deployer.delete('azure.network.dnsZone', zoneName, providerId, {});
          logger.log({ kind: 'delete', handler: 'azure-dns-zone', result: d });
          expect(d.success).toBe(true);
        }
      }
    },
    5 * 60_000,
  );
});
