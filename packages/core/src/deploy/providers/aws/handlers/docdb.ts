/**
 * DocumentDB Handler
 *
 * Handles: aws.docdb.cluster
 *
 * CreateDBCluster + N × CreateDBInstance (one per instance_count).
 * Like RDS, refuses to ship with an empty master password.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.docdb.cluster';
const SDK = '@aws-sdk/client-docdb';

export const docdb_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('docdb') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'DocumentDB', SDK);

    if (!properties.master_user_password) {
      return err(name, TYPE, 'create', start, 'DocumentDB create refused: master_user_password is empty.');
    }

    try {
      const docdb = await load_aws_sdk(SDK);
      if (!docdb) return sdkMissing(name, TYPE, 'create', start, 'DocumentDB', SDK);

      const clusterId = (properties.db_cluster_identifier as string) || name;
      const instanceCount = (properties.instance_count as number) ?? 1;

      await client.send(
        new docdb.CreateDBClusterCommand({
          DBClusterIdentifier: clusterId,
          Engine: 'docdb',
          EngineVersion: properties.engine_version as string,
          MasterUsername: properties.master_username as string,
          MasterUserPassword: properties.master_user_password as string,
          BackupRetentionPeriod: (properties.backup_retention_period as number) ?? 7,
          StorageEncrypted: properties.storage_encrypted !== false,
          Port: (properties.port as number) || 27017,
        }),
      );

      for (let i = 0; i < instanceCount; i++) {
        await client.send(
          new docdb.CreateDBInstanceCommand({
            DBInstanceIdentifier: `${clusterId}-${i + 1}`,
            DBClusterIdentifier: clusterId,
            DBInstanceClass: (properties.db_instance_class as string) || 'db.t3.medium',
            Engine: 'docdb',
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:docdb:${ctx.region}:*:cluster:${clusterId}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('docdb') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'DocumentDB', SDK);

    try {
      const docdb = await load_aws_sdk(SDK);
      if (!docdb) return sdkMissing(name, TYPE, 'update', start, 'DocumentDB', SDK);

      // ModifyDBCluster covers the safe-to-mutate fields. ApplyImmediately
      // is true so callers see the effect on the next describe call;
      // some changes still queue for the maintenance window in AWS land.
      const clusterId = (properties.db_cluster_identifier as string) || name;
      await client.send(
        new docdb.ModifyDBClusterCommand({
          DBClusterIdentifier: clusterId,
          BackupRetentionPeriod: properties.backup_retention_period as number | undefined,
          PreferredBackupWindow: properties.preferred_backup_window as string | undefined,
          PreferredMaintenanceWindow: properties.preferred_maintenance_window as string | undefined,
          MasterUserPassword: properties.master_user_password as string | undefined,
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
    const client = ctx.clients.get('docdb') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'DocumentDB SDK not available');

    try {
      const docdb = await load_aws_sdk(SDK);
      if (!docdb) return err(name, TYPE, 'delete', start, 'DocumentDB SDK not available');

      await client.send(
        new docdb.DeleteDBClusterCommand({
          DBClusterIdentifier: name,
          SkipFinalSnapshot: true,
        }),
      );
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
