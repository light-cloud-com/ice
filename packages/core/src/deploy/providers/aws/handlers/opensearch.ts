/**
 * OpenSearch Handler
 *
 * Handles: aws.opensearch.domain
 *
 * CreateDomain (single-call setup; updates + deletes are simple
 * pass-throughs). OpenSearch domain creation takes 10-15 minutes
 * — polling deferred until the canvas shows long-running state.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.opensearch.domain';
const SDK = '@aws-sdk/client-opensearch';

export const opensearch_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('opensearch') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'OpenSearch', SDK);

    try {
      const os = await load_aws_sdk(SDK);
      if (!os) return sdkMissing(name, TYPE, 'create', start, 'OpenSearch', SDK);

      await client.send(
        new os.CreateDomainCommand({
          DomainName: name,
          EngineVersion: properties.engine_version as string,
          ClusterConfig: {
            InstanceType: properties.instance_type as string,
            InstanceCount: properties.instance_count as number,
            DedicatedMasterEnabled: properties.dedicated_master_enabled as boolean,
            DedicatedMasterType: properties.dedicated_master_type as string,
            DedicatedMasterCount: properties.dedicated_master_count as number,
          },
          EBSOptions: {
            EBSEnabled: properties.ebs_enabled as boolean,
            VolumeType: properties.ebs_volume_type as string,
            VolumeSize: properties.ebs_volume_size_gb as number,
          },
          EncryptionAtRestOptions: { Enabled: properties.encryption_at_rest as boolean },
          NodeToNodeEncryptionOptions: { Enabled: properties.node_to_node_encryption as boolean },
        }),
      );
      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:es:${ctx.region}:*:domain/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('opensearch') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'OpenSearch SDK not available');

    try {
      const os = await load_aws_sdk(SDK);
      if (!os) return err(name, TYPE, 'delete', start, 'OpenSearch SDK not available');

      await client.send(new os.DeleteDomainCommand({ DomainName: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
