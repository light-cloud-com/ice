import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const rs = makeSdkMock({
    client_class_name: 'RedshiftClient',
    command_class_names: ['CreateClusterCommand', 'DeleteClusterCommand', 'ModifyClusterCommand'],
  });
  install_dynamic_import_stub({ '@aws-sdk/client-redshift': rs.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, rs };
}

describe('aws.redshift.cluster handler', () => {
  it('refuses to create when master_user_password is empty', async () => {
    const { d } = await setup();
    const out = await d.create('aws.redshift.cluster', 'dw', { master_user_password: '' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/master_user_password is empty/);
  });

  it('creates the cluster on the happy path', async () => {
    const { d, rs } = await setup();
    const out = await d.create(
      'aws.redshift.cluster',
      'dw',
      {
        node_type: 'dc2.large',
        cluster_type: 'single-node',
        db_name: 'analytics',
        master_username: 'admin',
        master_user_password: 'secret',
        port: 5439,
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(rs.sendCalls[0].__cmd).toBe('CreateCluster');
    expect(rs.sendCalls[0].input.ClusterIdentifier).toBe('dw');
  });

  it('updates the cluster via ModifyCluster (A4 update path)', async () => {
    const { d, rs } = await setup();
    const out = await d.update(
      'aws.redshift.cluster',
      'dw',
      'arn:aws:redshift:us-east-1:123:cluster/dw',
      { node_type: 'dc2.8xlarge', number_of_nodes: 4 },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const modify_call = rs.sendCalls.find((c) => c.__cmd === 'ModifyCluster');
    expect(modify_call).toBeDefined();
    expect(modify_call?.input.ClusterIdentifier).toBe('dw');
    expect(modify_call?.input.NodeType).toBe('dc2.8xlarge');
    expect(modify_call?.input.NumberOfNodes).toBe(4);
  });
});
