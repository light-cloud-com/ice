/**
 * Tests for the aws.rds.dbInstance handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup(opts: { available?: boolean; failed?: boolean } = { available: true }) {
  const rds = makeSdkMock({
    client_class_name: 'RDSClient',
    command_class_names: [
      'CreateDBInstanceCommand',
      'DescribeDBInstancesCommand',
      'ModifyDBInstanceCommand',
      'DeleteDBInstanceCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'DescribeDBInstances') {
        const status = opts.failed ? 'failed' : opts.available ? 'available' : 'creating';
        return { DBInstances: [{ DBInstanceStatus: status }] };
      }
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-rds': rds.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, rds };
}

describe('aws.rds.dbInstance handler', () => {
  it('refuses to create when master_user_password is empty', async () => {
    const { d } = await setup();
    const out = await d.create(
      'aws.rds.dbInstance',
      'db',
      { engine: 'postgres', engine_version: '16', master_username: 'postgres', master_user_password: '' },
      {},
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/master_user_password is empty/);
  });

  it('creates the instance + polls until status=available', async () => {
    const { d, rds } = await setup({ available: true });
    const out = await d.create(
      'aws.rds.dbInstance',
      'db',
      {
        engine: 'postgres',
        engine_version: '16',
        master_username: 'postgres',
        master_user_password: 'secret',
        db_instance_class: 'db.t3.micro',
        allocated_storage: 20,
      },
      {},
    );
    expect(out.success).toBe(true);
    const cmds = rds.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateDBInstance', 'DescribeDBInstances']);
  });

  it('errors out when DescribeDBInstances returns status=failed', async () => {
    const { d } = await setup({ failed: true });
    const out = await d.create(
      'aws.rds.dbInstance',
      'db',
      { engine: 'postgres', master_username: 'a', master_user_password: 'p' },
      {},
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/failed state/);
  });
});
