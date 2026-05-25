import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const rs = makeSdkMock({
    client_class_name: 'RedshiftClient',
    command_class_names: ['CreateClusterCommand', 'DeleteClusterCommand'],
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
});
