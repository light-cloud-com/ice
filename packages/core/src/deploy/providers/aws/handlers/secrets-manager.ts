/**
 * Secrets Manager Handler
 *
 * Handles: aws.secretsmanager.secret
 *
 * Mirrors the GCP Secret Manager handler's contract: the schema-
 * declared deploy-expansion pass emits one of these per binding row,
 * so this handler just creates / updates / deletes ONE Secret. Values
 * are NOT written — operators populate `SecretString`/`SecretBinary`
 * via the AWS console / CLI, same security tradeoff as GCP.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.secretsmanager.secret';
const SDK = '@aws-sdk/client-secrets-manager';

export const secrets_manager_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('secrets-manager') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Secrets Manager', SDK);

    try {
      const sm = await load_aws_sdk(SDK);
      if (!sm) return sdkMissing(name, TYPE, 'create', start, 'Secrets Manager', SDK);

      const created = await client.send(
        new sm.CreateSecretCommand({
          Name: name,
          Description: (properties.description as string) || 'Auto-created by ICE',
          KmsKeyId: (properties.kms_key_id as string) || undefined,
          Tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
        }),
      );
      const arn = created?.ARN || `arn:aws:secretsmanager:${ctx.region}:*:secret:${name}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('secrets-manager') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Secrets Manager SDK not available');

    try {
      const sm = await load_aws_sdk(SDK);
      if (!sm) return err(name, TYPE, 'update', start, 'Secrets Manager SDK not available');

      // Description + KMS key are the only fields safe to update from
      // the canvas — rotation is operator-managed; tags are best-effort.
      await client.send(
        new sm.UpdateSecretCommand({
          SecretId: provider_id,
          Description: (properties.description as string) || undefined,
          KmsKeyId: (properties.kms_key_id as string) || undefined,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('secrets-manager') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Secrets Manager SDK not available');

    try {
      const sm = await load_aws_sdk(SDK);
      if (!sm) return err(name, TYPE, 'delete', start, 'Secrets Manager SDK not available');

      // ForceDeleteWithoutRecovery=true skips the default 30-day
      // recovery window — appropriate when an ICE deploy is the
      // source of truth and the operator explicitly removed the
      // binding from the canvas.
      await client.send(
        new sm.DeleteSecretCommand({ SecretId: provider_id || name, ForceDeleteWithoutRecovery: true }),
      );
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
