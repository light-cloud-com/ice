/**
 * Unit tests for `services/deploy/src/providers/aws/credential-resolver.ts` —
 * the AWS-side `CredentialResolver` exposed via `providers/registry.ts`.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { awsCredentialResolver } from '../credential-resolver.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('awsCredentialResolver.resolve', () => {
  it('throws a connect-prompt error when credentials are missing', async () => {
    await expect(
      awsCredentialResolver.resolve({ orgId: 'org-1', credentials: undefined }),
    ).rejects.toThrow(/AWS provider not connected/);
  });

  it('throws a connect-prompt error when credentials are explicitly null', async () => {
    await expect(
      awsCredentialResolver.resolve({ orgId: 'org-1', credentials: null }),
    ).rejects.toThrow(/AWS provider not connected/);
  });

  it('throws when access_key_id is missing', async () => {
    await expect(
      awsCredentialResolver.resolve({
        orgId: 'org-1',
        credentials: { secret_access_key: 'shh' },
      }),
    ).rejects.toThrow(/access_key_id \/ secret_access_key/);
  });

  it('throws when secret_access_key is missing', async () => {
    await expect(
      awsCredentialResolver.resolve({
        orgId: 'org-1',
        credentials: { access_key_id: 'AKIA' },
      }),
    ).rejects.toThrow(/access_key_id \/ secret_access_key/);
  });

  it('returns an aws-static auth bundle when snake_case credentials are present', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        access_key_id: 'AKIA-SNAKE',
        secret_access_key: 'snake-secret',
        account_id: '111222333444',
        region: 'eu-west-2',
      },
    });

    expect(auth.authClient.type).toBe('aws-static');
    expect(auth.authClient.credentials).toEqual({
      accessKeyId: 'AKIA-SNAKE',
      secretAccessKey: 'snake-secret',
    });
    expect(auth.authClient.region).toBe('eu-west-2');
    expect(auth.scope).toEqual({
      provider: 'aws',
      accountId: '111222333444',
      region: 'eu-west-2',
    });
    expect(auth.metadata).toEqual({ region: 'eu-west-2' });
  });

  it('accepts camelCase credential keys as the fallback shape', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        accessKeyId: 'AKIA-CAMEL',
        secretAccessKey: 'camel-secret',
        accountId: '999888777666',
        region: 'us-west-1',
      },
    });

    expect(auth.authClient.credentials.accessKeyId).toBe('AKIA-CAMEL');
    expect(auth.authClient.credentials.secretAccessKey).toBe('camel-secret');
    expect(auth.scope.accountId).toBe('999888777666');
  });

  it('includes sessionToken in credentials when session_token is provided', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        access_key_id: 'AKIA',
        secret_access_key: 'shh',
        session_token: 'sess-snake',
      },
    });

    expect(auth.authClient.credentials.sessionToken).toBe('sess-snake');
  });

  it('includes sessionToken when only camelCase sessionToken is provided', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        access_key_id: 'AKIA',
        secret_access_key: 'shh',
        sessionToken: 'sess-camel',
      },
    });

    expect(auth.authClient.credentials.sessionToken).toBe('sess-camel');
  });

  it('omits sessionToken when neither session_token nor sessionToken is set', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: { access_key_id: 'AKIA', secret_access_key: 'shh' },
    });

    expect('sessionToken' in auth.authClient.credentials).toBe(false);
  });

  it('prefers requestedScope.region over the credential blob region', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        access_key_id: 'AKIA',
        secret_access_key: 'shh',
        region: 'eu-west-2',
      },
      requestedScope: { region: 'ap-northeast-1' },
    });

    expect(auth.authClient.region).toBe('ap-northeast-1');
    expect(auth.scope.region).toBe('ap-northeast-1');
    expect(auth.metadata).toEqual({ region: 'ap-northeast-1' });
  });

  it('falls back to credential blob region when requestedScope omits region', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: {
        access_key_id: 'AKIA',
        secret_access_key: 'shh',
        region: 'sa-east-1',
      },
      requestedScope: {},
    });

    expect(auth.authClient.region).toBe('sa-east-1');
  });

  it('defaults region to us-east-1 when no requestedScope or credential region is present', async () => {
    const auth = await awsCredentialResolver.resolve({
      orgId: 'org-1',
      credentials: { access_key_id: 'AKIA', secret_access_key: 'shh' },
    });

    expect(auth.authClient.region).toBe('us-east-1');
    expect(auth.scope.region).toBe('us-east-1');
  });
});

describe('awsCredentialResolver.cleanup', () => {
  it('resolves to undefined for static credentials with no on-disk footprint', async () => {
    await expect(
      awsCredentialResolver.cleanup({
        authClient: {},
        scope: { provider: 'aws' },
      }),
    ).resolves.toBeUndefined();
  });
});

describe('awsCredentialResolver shape', () => {
  it('reports its provider as "aws"', () => {
    expect(awsCredentialResolver.provider).toBe('aws');
  });
});
