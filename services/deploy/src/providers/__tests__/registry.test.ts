/**
 * Unit tests for `services/deploy/src/providers/registry.ts` —
 * the credential-resolver lookup that deploy.service.ts uses to
 * dispatch on provider id ('aws' / 'gcp' / future Azure / k8s).
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * The registry imports the AWS + GCP resolver objects at module load.
 * The GCP resolver pulls in `@ice/service-credentials` and
 * `../../services/deploy-locks.js` as side-effect imports — both are
 * mocked here so the registry test stays unit-scoped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ice/service-credentials', () => ({
  getValidGCPAccessToken: vi.fn(),
  updateGCPOAuthTokens: vi.fn(),
}));

vi.mock('../../services/deploy-locks', () => ({
  registerTempDir: vi.fn(),
  releaseTempDir: vi.fn(),
}));

vi.mock('../aws/credential-resolver', () => ({
  awsCredentialResolver: {
    provider: 'aws',
    resolve: vi.fn(),
    cleanup: vi.fn(),
  },
}));

vi.mock('../gcp/credential-resolver', () => ({
  gcpCredentialResolver: {
    provider: 'gcp',
    resolve: vi.fn(),
    cleanup: vi.fn(),
  },
}));

import { awsCredentialResolver } from '../aws/credential-resolver';
import { gcpCredentialResolver } from '../gcp/credential-resolver';
import { CREDENTIAL_RESOLVERS, resolveProviderAuth, cleanupProviderAuth } from '../registry';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CREDENTIAL_RESOLVERS table', () => {
  it('exposes a gcp entry pointing at gcpCredentialResolver', () => {
    expect(CREDENTIAL_RESOLVERS.gcp).toBe(gcpCredentialResolver);
  });

  it('exposes an aws entry pointing at awsCredentialResolver', () => {
    expect(CREDENTIAL_RESOLVERS.aws).toBe(awsCredentialResolver);
  });

  it('does not register azure (or other future providers) yet', () => {
    expect(CREDENTIAL_RESOLVERS.azure).toBeUndefined();
    expect(CREDENTIAL_RESOLVERS.kubernetes).toBeUndefined();
  });
});

describe('resolveProviderAuth', () => {
  it('delegates to the gcp resolver and returns its auth bundle for "gcp"', async () => {
    const fakeAuth = { authClient: 'gcp-client', scope: { provider: 'gcp' } };
    (gcpCredentialResolver.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeAuth);

    const result = await resolveProviderAuth('gcp', { orgId: 'org-1', credentials: {} });

    expect(gcpCredentialResolver.resolve).toHaveBeenCalledTimes(1);
    expect(gcpCredentialResolver.resolve).toHaveBeenCalledWith({ orgId: 'org-1', credentials: {} });
    expect(awsCredentialResolver.resolve).not.toHaveBeenCalled();
    expect(result).toBe(fakeAuth);
  });

  it('delegates to the aws resolver and returns its auth bundle for "aws"', async () => {
    const fakeAuth = { authClient: 'aws-client', scope: { provider: 'aws' } };
    (awsCredentialResolver.resolve as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeAuth);

    const result = await resolveProviderAuth('aws', { orgId: 'org-1', credentials: {} });

    expect(awsCredentialResolver.resolve).toHaveBeenCalledTimes(1);
    expect(gcpCredentialResolver.resolve).not.toHaveBeenCalled();
    expect(result).toBe(fakeAuth);
  });

  it('throws a clear "not supported yet" error for an unregistered provider', async () => {
    await expect(resolveProviderAuth('azure', { orgId: 'org-1', credentials: {} })).rejects.toThrow(
      /Provider 'azure' is not supported yet/,
    );
  });

  it('throws for an empty provider string', async () => {
    await expect(resolveProviderAuth('', { orgId: 'org-1', credentials: {} })).rejects.toThrow(
      /Provider '' is not supported yet/,
    );
  });

  it('propagates errors thrown by the underlying resolver', async () => {
    const original = new Error('upstream auth blew up');
    (gcpCredentialResolver.resolve as ReturnType<typeof vi.fn>).mockRejectedValueOnce(original);

    await expect(resolveProviderAuth('gcp', { orgId: 'org-1', credentials: {} })).rejects.toBe(original);
  });
});

describe('cleanupProviderAuth', () => {
  it('delegates to the gcp resolver cleanup for "gcp"', async () => {
    const auth = { authClient: 'x', scope: { provider: 'gcp' as const }, tempDir: '/tmp/x' };
    (gcpCredentialResolver.cleanup as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await cleanupProviderAuth('gcp', auth);

    expect(gcpCredentialResolver.cleanup).toHaveBeenCalledTimes(1);
    expect(gcpCredentialResolver.cleanup).toHaveBeenCalledWith(auth);
  });

  it('delegates to the aws resolver cleanup for "aws"', async () => {
    const auth = { authClient: 'y', scope: { provider: 'aws' as const } };
    (awsCredentialResolver.cleanup as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    await cleanupProviderAuth('aws', auth);

    expect(awsCredentialResolver.cleanup).toHaveBeenCalledTimes(1);
  });

  it('silently no-ops for an unregistered provider (no throw)', async () => {
    const auth = { authClient: 'z', scope: { provider: 'azure' as const } };

    await expect(cleanupProviderAuth('azure', auth)).resolves.toBeUndefined();

    expect(gcpCredentialResolver.cleanup).not.toHaveBeenCalled();
    expect(awsCredentialResolver.cleanup).not.toHaveBeenCalled();
  });

  it('awaits the underlying cleanup and surfaces its rejection', async () => {
    const auth = { authClient: 'x', scope: { provider: 'gcp' as const } };
    const original = new Error('cleanup blew up');
    (gcpCredentialResolver.cleanup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(original);

    await expect(cleanupProviderAuth('gcp', auth)).rejects.toBe(original);
  });
});
