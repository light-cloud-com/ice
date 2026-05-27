/**
 * Tests for the aws.route53.recordSet handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const r53 = makeSdkMock({
    client_class_name: 'Route53Client',
    command_class_names: ['ChangeResourceRecordSetsCommand'],
    sendImpl: () => ({ ChangeInfo: { Id: '/change/XYZ' } }),
  });
  install_dynamic_import_stub({ '@aws-sdk/client-route-53': r53.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, r53 };
}

describe('aws.route53.recordSet handler', () => {
  it('UPSERTs records on the supplied zone', async () => {
    const { d, r53 } = await setup();
    const out = await d.create(
      'aws.route53.recordSet',
      'site-records',
      {
        hosted_zone_id: 'Z123',
        records: [
          { name: 'app.example.com.', type: 'A', ttl: 60, values: ['1.2.3.4'] },
          { name: '_acme.example.com.', type: 'CNAME', values: ['validator.aws.'] },
        ],
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toMatch(/^route53:Z123:/);
    const call = r53.sendCalls.find((c: any) => c.__cmd === 'ChangeResourceRecordSets')!;
    expect(call.input.HostedZoneId).toBe('Z123');
    expect(call.input.ChangeBatch.Changes).toHaveLength(2);
    expect(call.input.ChangeBatch.Changes[0].Action).toBe('UPSERT');
    expect(call.input.ChangeBatch.Changes[0].ResourceRecordSet.Name).toBe('app.example.com.');
  });

  it('refuses to create without hosted_zone_id', async () => {
    const { d } = await setup();
    const out = await d.create(
      'aws.route53.recordSet',
      'site',
      { records: [{ name: 'a', type: 'A', values: ['1'] }] },
      {},
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/hosted_zone_id/);
  });

  it('refuses to create when records is empty', async () => {
    const { d } = await setup();
    const out = await d.create('aws.route53.recordSet', 'site', { hosted_zone_id: 'Z1' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/at least one entry/);
  });

  it('delete succeeds quietly when no record state is preserved', async () => {
    const { d } = await setup();
    const out = await d.delete('aws.route53.recordSet', 'site', 'route53:Z123:site', {});
    expect(out.success).toBe(true);
  });
});
