/**
 * Tests for the aws.docdb.cluster handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const docdb = makeSdkMock({
    client_class_name: 'DocDBClient',
    command_class_names: [
      'CreateDBClusterCommand',
      'CreateDBInstanceCommand',
      'DeleteDBClusterCommand',
      'ModifyDBClusterCommand',
    ],
  });
  install_dynamic_import_stub({ '@aws-sdk/client-docdb': docdb.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, docdb };
}

describe('aws.docdb.cluster handler', () => {
  it('refuses to create without master_user_password', async () => {
    const { d } = await setup();
    const out = await d.create('aws.docdb.cluster', 'db', { master_username: 'admin', master_user_password: '' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/master_user_password is empty/);
  });

  it('creates cluster + N instances per instance_count', async () => {
    const { d, docdb } = await setup();
    const out = await d.create(
      'aws.docdb.cluster',
      'db',
      { master_username: 'admin', master_user_password: 'p', instance_count: 3 },
      {},
    );
    expect(out.success).toBe(true);
    const cmds = docdb.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateDBCluster', 'CreateDBInstance', 'CreateDBInstance', 'CreateDBInstance']);
  });

  it('updates cluster via ModifyDBCluster (A4 update path)', async () => {
    const { d, docdb } = await setup();
    const out = await d.update(
      'aws.docdb.cluster',
      'db',
      'arn:aws:rds:us-east-1:123:cluster:db',
      { backup_retention_period: 14, preferred_backup_window: '03:00-04:00' },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const modify_call = docdb.sendCalls.find((c: any) => c.__cmd === 'ModifyDBCluster');
    expect(modify_call).toBeDefined();
    expect(modify_call?.input.DBClusterIdentifier).toBe('db');
    expect(modify_call?.input.BackupRetentionPeriod).toBe(14);
  });
});
