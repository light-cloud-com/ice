/**
 * RDS Handler
 *
 * Handles: aws.rds.dbInstance
 *
 * CreateDBInstance + optional status polling. RDS provisioning takes
 * 5–10 minutes; the handler optionally polls DescribeDBInstances
 * until the instance status reads "available". Polling is bounded by
 * a 20-minute cap and respects ctx.abort_signal (cancel-safe).
 *
 * Honours the extractor's no-default-password invariant — refuses to
 * call CreateDBInstance when master_user_password is empty.
 */

import { resolve_aws_network_refs } from '../network-resolver';
import { load_aws_sdk } from '../sdk-loader';
import { delete_rds_db_subnet_group_if_present, ensure_rds_db_subnet_group } from '../subnet-groups';
import { err, ok, sdkMissing } from './_result';
import type { AWSHandlerContext, AWSResourceHandler } from '../types';

const TYPE = 'aws.rds.dbInstance';
const SDK = '@aws-sdk/client-rds';
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

async function wait_until_available(client: any, rds: any, identifier: string, ctx: AWSHandlerContext): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let step = 0;
  while (Date.now() < deadline) {
    if (ctx.abort_signal?.aborted) throw new Error('RDS provisioning cancelled');
    const describe = await client.send(new rds.DescribeDBInstancesCommand({ DBInstanceIdentifier: identifier }));
    const status = describe?.DBInstances?.[0]?.DBInstanceStatus;
    ctx.on_step?.(identifier, { label: `RDS status: ${status}`, index: step++, total: 0 });
    if (status === 'available') return;
    if (status === 'failed') throw new Error(`RDS instance ${identifier} entered failed state`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for RDS instance ${identifier} to become available`);
}

export const rds_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('rds') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'RDS', SDK);

    if (!properties.master_user_password) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'RDS create refused: master_user_password is empty. Wire a Security.Secret block or set the field explicitly.',
      );
    }

    try {
      const rds = await load_aws_sdk(SDK);
      if (!rds) return sdkMissing(name, TYPE, 'create', start, 'RDS', SDK);

      // Auto-bootstrap a DBSubnetGroup when canvas Network.Subnet
      // blocks are wired. Falls back to the operator's
      // properties.db_subnet_group_name, then to AWS default-VPC
      // behaviour when nothing is supplied.
      const subnetGroup = await ensure_rds_db_subnet_group(name, properties, ctx);
      const network = await resolve_aws_network_refs(properties, ctx);

      await client.send(
        new rds.CreateDBInstanceCommand({
          DBInstanceIdentifier: name,
          DBInstanceClass: (properties.db_instance_class as string) || 'db.t3.micro',
          Engine: properties.engine as string,
          EngineVersion: properties.engine_version as string,
          AllocatedStorage: (properties.allocated_storage as number) || 20,
          StorageType: (properties.storage_type as string) || 'gp3',
          MasterUsername: properties.master_username as string,
          MasterUserPassword: properties.master_user_password as string,
          Port: properties.port as number,
          PubliclyAccessible: !!properties.publicly_accessible,
          MultiAZ: !!properties.multi_az,
          BackupRetentionPeriod: (properties.backup_retention_period as number) ?? 7,
          DBSubnetGroupName: subnetGroup,
          VpcSecurityGroupIds: network.security_groups.length > 0 ? network.security_groups : undefined,
        }),
      );

      // Poll until the instance is available. Set ctx.abort_signal to
      // cancel mid-flight; the loop also logs status via on_step so
      // the UI can show progress.
      await wait_until_available(client, rds, name, ctx);

      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:rds:${ctx.region}:*:db:${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('rds') as any;
    if (!client) return err(name, TYPE, 'update', start, 'RDS SDK not available');

    try {
      const rds = await load_aws_sdk(SDK);
      if (!rds) return err(name, TYPE, 'update', start, 'RDS SDK not available');

      await client.send(
        new rds.ModifyDBInstanceCommand({
          DBInstanceIdentifier: name,
          DBInstanceClass: properties.db_instance_class as string,
          AllocatedStorage: properties.allocated_storage as number,
          BackupRetentionPeriod: properties.backup_retention_period as number,
          ApplyImmediately: true,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('rds') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'RDS SDK not available');

    try {
      const rds = await load_aws_sdk(SDK);
      if (!rds) return err(name, TYPE, 'delete', start, 'RDS SDK not available');

      await client.send(
        new rds.DeleteDBInstanceCommand({
          DBInstanceIdentifier: name,
          SkipFinalSnapshot: true,
          DeleteAutomatedBackups: true,
        }),
      );
      // Sweep the ICE-managed subnet group too. AWS rejects the
      // call while the instance still references it, so wait for
      // the instance to clear before retrying. For now best-effort:
      // operators get a clear "delete subnet group" follow-up if
      // this races.
      try {
        await delete_rds_db_subnet_group_if_present(name, ctx);
      } catch {
        /* leave to operator / cleanup-orphans sweep */
      }
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
