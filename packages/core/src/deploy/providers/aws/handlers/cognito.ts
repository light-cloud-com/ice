/**
 * Cognito Handler
 *
 * Handles: aws.cognito.userPool
 *
 * Creates a Cognito User Pool with the password policy + MFA config
 * + auto-verified attributes laid down by the extractor.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.cognito.userPool';
const SDK = '@aws-sdk/client-cognito-identity-provider';

export const cognito_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cognito') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Cognito Identity Provider', SDK);

    try {
      const cognito = await load_aws_sdk(SDK);
      if (!cognito) return sdkMissing(name, TYPE, 'create', start, 'Cognito Identity Provider', SDK);

      const pp = (properties.password_policy as Record<string, unknown>) || {};
      const created = await client.send(
        new cognito.CreateUserPoolCommand({
          PoolName: name,
          AutoVerifiedAttributes: properties.auto_verified_attributes as string[],
          MfaConfiguration: (properties.mfa_configuration as string) || 'OFF',
          Policies: {
            PasswordPolicy: {
              MinimumLength: (pp.minimum_length as number) || 8,
              RequireUppercase: pp.require_uppercase !== false,
              RequireLowercase: pp.require_lowercase !== false,
              RequireNumbers: pp.require_numbers !== false,
              RequireSymbols: pp.require_symbols === true,
            },
          },
          UserPoolTags: properties.tags as Record<string, string>,
        }),
      );
      const arn = created?.UserPool?.Arn ?? `arn:aws:cognito-idp:${ctx.region}:*:userpool/${name}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // Cognito attribute changes are mostly destructive — defer to a
    // future commit. No-op the update path until then.
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cognito') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Cognito SDK not available');

    try {
      const cognito = await load_aws_sdk(SDK);
      if (!cognito) return err(name, TYPE, 'delete', start, 'Cognito SDK not available');

      // Cognito needs the UserPoolId (last segment of the ARN).
      const userPoolId = provider_id.split('/').pop();
      await client.send(new cognito.DeleteUserPoolCommand({ UserPoolId: userPoolId }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
