/**
 * Redshift Handler
 *
 * Handles: aws.redshift.cluster
 *
 * Standard CreateCluster with the password-required invariant
 * shared by RDS + DocDB. Multi-node vs single-node is set by
 * cluster_type + number_of_nodes from the extractor.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.redshift.cluster';
const SDK = '@aws-sdk/client-redshift';

export const redshift_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redshift') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Redshift', SDK);

    if (!properties.master_user_password) {
      return err(name, TYPE, 'create', start, 'Redshift create refused: master_user_password is empty.');
    }

    try {
      const rs = await load_aws_sdk(SDK);
      if (!rs) return sdkMissing(name, TYPE, 'create', start, 'Redshift', SDK);

      await client.send(
        new rs.CreateClusterCommand({
          ClusterIdentifier: name,
          NodeType: properties.node_type as string,
          ClusterType: properties.cluster_type as string,
          NumberOfNodes: properties.number_of_nodes as number,
          DBName: properties.db_name as string,
          MasterUsername: properties.master_username as string,
          MasterUserPassword: properties.master_user_password as string,
          PubliclyAccessible: !!properties.publicly_accessible,
          Encrypted: properties.encrypted !== false,
          Port: properties.port as number,
        }),
      );
      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:redshift:${ctx.region}:*:cluster:${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redshift') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'Redshift', SDK);

    try {
      const rs = await load_aws_sdk(SDK);
      if (!rs) return sdkMissing(name, TYPE, 'update', start, 'Redshift', SDK);

      // ModifyCluster — reshape (node_type + number_of_nodes) is the
      // big one operators care about. Password rotation also supported.
      await client.send(
        new rs.ModifyClusterCommand({
          ClusterIdentifier: name,
          NodeType: properties.node_type as string | undefined,
          NumberOfNodes: properties.number_of_nodes as number | undefined,
          ClusterType: properties.cluster_type as string | undefined,
          MasterUserPassword: properties.master_user_password as string | undefined,
          PreferredMaintenanceWindow: properties.preferred_maintenance_window as string | undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redshift') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Redshift SDK not available');

    try {
      const rs = await load_aws_sdk(SDK);
      if (!rs) return err(name, TYPE, 'delete', start, 'Redshift SDK not available');

      await client.send(new rs.DeleteClusterCommand({ ClusterIdentifier: name, SkipFinalClusterSnapshot: true }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
