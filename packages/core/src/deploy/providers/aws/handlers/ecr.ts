/**
 * ECR Repository Handler
 *
 * Handles: aws.ecr.repository — backs Compute.ContainerRegistry on AWS
 * (parallel to GCP Artifact Registry and Azure ACR).
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.ecr.repository';
const SDK = '@aws-sdk/client-ecr';

export const ecr_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecr') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'ECR', SDK);

    try {
      const ecr = await load_aws_sdk(SDK);
      if (!ecr) return sdkMissing(name, TYPE, 'create', start, 'ECR', SDK);
      const result = await client.send(
        new ecr.CreateRepositoryCommand({
          repositoryName: name,
          imageTagMutability: (properties.image_tag_mutability as string) || 'MUTABLE',
          imageScanningConfiguration: { scanOnPush: properties.scan_on_push !== false },
          encryptionConfiguration: { encryptionType: (properties.encryption_type as string) || 'AES256' },
        }),
      );
      return ok(name, TYPE, 'create', start, { provider_id: result?.repository?.repositoryArn ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecr') as any;
    if (!client) return err(name, TYPE, 'update', start, 'ECR SDK not available');
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecr') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'ECR SDK not available');
    try {
      const ecr = await load_aws_sdk(SDK);
      if (!ecr) return err(name, TYPE, 'delete', start, 'ECR SDK not available');
      await client.send(new ecr.DeleteRepositoryCommand({ repositoryName: name, force: true }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
