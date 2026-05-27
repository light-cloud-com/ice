/**
 * Tests for `aws/network-resolver.ts`.
 *
 * Resolver merges operator-supplied raw arrays with canvas-driven
 * `connected_subnet_names` / `connected_security_group_names`
 * resolved via DescribeSubnets / DescribeSecurityGroups.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolve_aws_network_refs } from '../network-resolver';
import {
  install_dynamic_import_stub,
  makeSdkMock,
  restore_dynamic_import_stub,
} from '../../__tests__/_aws-test-harness';
import type { AWSHandlerContext } from '../types';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

function mock_ec2(subnetMap: Record<string, string>, sgMap: Record<string, string>) {
  return makeSdkMock({
    client_class_name: 'EC2Client',
    command_class_names: ['DescribeSubnetsCommand', 'DescribeSecurityGroupsCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'DescribeSubnets') {
        const names: string[] = cmd.input.Filters[0].Values;
        return { Subnets: names.map((n) => ({ SubnetId: subnetMap[n] })).filter((s) => s.SubnetId) };
      }
      if (cmd.__cmd === 'DescribeSecurityGroups') {
        const names: string[] = cmd.input.Filters[0].Values;
        return { SecurityGroups: names.map((n) => ({ GroupId: sgMap[n] })).filter((s) => s.GroupId) };
      }
      return {};
    },
  });
}

function ctx_with(mock: ReturnType<typeof mock_ec2>): AWSHandlerContext {
  const clients = new Map<string, unknown>();
  // mock_ec2's client constructor reads `args.region` and uses the shared `send`.
  // We instantiate it the same way the handlers do.
  const ClientCtor = mock.module['EC2Client'] as any;
  clients.set('ec2', new ClientCtor({ region: 'us-east-1' }));
  return {
    region: 'us-east-1',
    clients,
    ensure_account_id: async () => '000000000000',
  };
}

describe('resolve_aws_network_refs', () => {
  it('resolves canvas-driven subnet names to subnet ids', async () => {
    const mock = mock_ec2({ 'app-subnet': 'subnet-aaa', 'db-subnet': 'subnet-bbb' }, {});
    install_dynamic_import_stub({ '@aws-sdk/client-ec2': mock.module });
    const ctx = ctx_with(mock);
    const result = await resolve_aws_network_refs({ connected_subnet_names: ['app-subnet', 'db-subnet'] }, ctx);
    expect(result.subnets).toEqual(['subnet-aaa', 'subnet-bbb']);
    expect(result.security_groups).toEqual([]);
  });

  it('resolves security group names too', async () => {
    const mock = mock_ec2({}, { 'web-sg': 'sg-aaa' });
    install_dynamic_import_stub({ '@aws-sdk/client-ec2': mock.module });
    const ctx = ctx_with(mock);
    const result = await resolve_aws_network_refs({ connected_security_group_names: ['web-sg'] }, ctx);
    expect(result.security_groups).toEqual(['sg-aaa']);
  });

  it('merges operator-supplied raw arrays with canvas-driven ids (de-duped)', async () => {
    const mock = mock_ec2({ 'app-subnet': 'subnet-aaa' }, { 'web-sg': 'sg-aaa' });
    install_dynamic_import_stub({ '@aws-sdk/client-ec2': mock.module });
    const ctx = ctx_with(mock);
    const result = await resolve_aws_network_refs(
      {
        subnets: ['subnet-zzz', 'subnet-aaa'], // raw includes one canvas-resolved id → de-dupe
        security_groups: ['sg-zzz'],
        connected_subnet_names: ['app-subnet'],
        connected_security_group_names: ['web-sg'],
      },
      ctx,
    );
    expect(result.subnets).toEqual(['subnet-zzz', 'subnet-aaa']);
    expect(result.security_groups).toEqual(['sg-zzz', 'sg-aaa']);
  });

  it('returns empty arrays when nothing is wired', async () => {
    const mock = mock_ec2({}, {});
    install_dynamic_import_stub({ '@aws-sdk/client-ec2': mock.module });
    const ctx = ctx_with(mock);
    const result = await resolve_aws_network_refs({}, ctx);
    expect(result).toEqual({ subnets: [], security_groups: [] });
  });
});
