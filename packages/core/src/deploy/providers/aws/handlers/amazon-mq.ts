/**
 * AWS Amazon MQ handler — `aws.mq.broker`.
 *
 * Backs the `Messaging.RabbitMQ` block. AWS Amazon MQ runs RabbitMQ
 * (and ActiveMQ) as a managed broker. Single-instance + multi-AZ
 * deployments are both supported via `deployment_mode`.
 *
 * RabbitMQ admin credentials are required (broker won't create
 * without them) — mirrors the RDS/DocDB master-password contract.
 *
 * Provider id = broker ID (`b-xxxx`). Delete = DeleteBroker.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.mq.broker';
const SDK = '@aws-sdk/client-mq';

export const amazon_mq_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('mq') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Amazon MQ', SDK);

    const adminUsername = properties.admin_username as string | undefined;
    const adminPassword = properties.admin_password as string | undefined;
    if (!adminUsername || !adminPassword) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Amazon MQ broker requires admin_username + admin_password (wire a Security.Secret block or set explicitly).',
      );
    }

    try {
      const mq = await load_aws_sdk(SDK);
      if (!mq) return sdkMissing(name, TYPE, 'create', start, 'Amazon MQ', SDK);

      const result = await client.send(
        new mq.CreateBrokerCommand({
          BrokerName: name,
          EngineType: (properties.engine_type as string) || 'RABBITMQ',
          EngineVersion: (properties.engine_version as string) || '3.13',
          HostInstanceType: (properties.host_instance_type as string) || 'mq.t3.micro',
          DeploymentMode: (properties.deployment_mode as string) || 'SINGLE_INSTANCE',
          PubliclyAccessible: properties.publicly_accessible !== false,
          Users: [
            {
              Username: adminUsername,
              Password: adminPassword,
              ConsoleAccess: true,
            },
          ],
          SubnetIds: properties.subnets as string[] | undefined,
          SecurityGroups: properties.security_groups as string[] | undefined,
          AutoMinorVersionUpgrade: properties.auto_minor_version_upgrade !== false,
          Tags: properties.tags as Record<string, string> | undefined,
        }),
      );
      const brokerId = result?.BrokerId ?? name;
      const arn = result?.BrokerArn ?? `arn:aws:mq:${ctx.region}:*:broker:${brokerId}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('mq') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'Amazon MQ', SDK);

    try {
      const mq = await load_aws_sdk(SDK);
      if (!mq) return sdkMissing(name, TYPE, 'update', start, 'Amazon MQ', SDK);

      const brokerId = provider_id.split(':').pop();
      await client.send(
        new mq.UpdateBrokerCommand({
          BrokerId: brokerId,
          EngineVersion: properties.engine_version as string | undefined,
          HostInstanceType: properties.host_instance_type as string | undefined,
          AutoMinorVersionUpgrade: properties.auto_minor_version_upgrade as boolean | undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('mq') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Amazon MQ SDK not available');
    try {
      const mq = await load_aws_sdk(SDK);
      if (!mq) return err(name, TYPE, 'delete', start, 'Amazon MQ SDK not available');
      const brokerId = provider_id.split(':').pop();
      await client.send(new mq.DeleteBrokerCommand({ BrokerId: brokerId }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
