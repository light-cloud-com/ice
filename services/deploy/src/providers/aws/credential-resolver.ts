/**
 * AWS credential resolver — stub that returns an `@aws-sdk/credential-providers`
 * default chain so AWS handlers can wire in without another round of
 * copy-paste when they land. Intentionally minimal: the chain walks env
 * vars → shared config → EC2/ECS instance metadata → IAM role for SSO,
 * which is what every AWS SDK call already expects.
 *
 * The full AWS provider (handler registry, error classifier, SDK loader)
 * lands in a follow-up phase. This file exists so `CREDENTIAL_RESOLVERS`
 * in `providers/registry.ts` has an entry for AWS from day one.
 */

import type { CredentialResolver, ResolveAuthOptions, ScopedDeployAuth } from '../types';

export const awsCredentialResolver: CredentialResolver = {
  provider: 'aws',

  async resolve(options: ResolveAuthOptions): Promise<ScopedDeployAuth> {
    const { credentials, requestedScope } = options;
    if (!credentials) {
      throw new Error('AWS provider not connected. Please connect your AWS credentials first.');
    }

    // Prefer explicit access key / secret from the stored credential blob.
    // This mirrors how GCP's SA-key flow works: user-supplied credentials
    // are the source of truth, not ambient process state.
    const accessKeyId = credentials.access_key_id || credentials.accessKeyId;
    const secretAccessKey = credentials.secret_access_key || credentials.secretAccessKey;
    const sessionToken = credentials.session_token || credentials.sessionToken;
    const region = requestedScope?.region || credentials.region || 'us-east-1';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials missing access_key_id / secret_access_key. ' + 'Reconnect via Cloud Providers settings.',
      );
    }

    const authClient = {
      type: 'aws-static',
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
      region,
    };

    return {
      authClient,
      scope: {
        provider: 'aws',
        accountId: credentials.account_id || credentials.accountId,
        region,
      },
      metadata: { region },
    };
  },

  async cleanup(_auth: ScopedDeployAuth): Promise<void> {
    // AWS static credentials have no on-disk footprint to clean up.
  },
};
