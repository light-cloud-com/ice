/**
 * Unit tests for `services/deploy/src/services/deployer-factory.ts` —
 * the @ice/core dynamic-import wrapper extracted in rf-deploy-5 from
 * the deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @ice/core BEFORE the SUT is imported so the dynamic
// `import('@ice/core')` inside `getCoreEngine` resolves to these
// constructors. We don't care what the constructors return — the test
// is about WHICH one was instantiated for a given provider string.
vi.mock('@ice/core', () => ({
  AWSDeployer: vi.fn(),
  AzureDeployer: vi.fn(),
  GCPDeployer: vi.fn(),
}));

import { createDeployer, getCoreEngine } from '../deployer-factory';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above
import * as iceCore from '@ice/core';

const aws = (iceCore as any).AWSDeployer as ReturnType<typeof vi.fn>;
const azure = (iceCore as any).AzureDeployer as ReturnType<typeof vi.fn>;
const gcp = (iceCore as any).GCPDeployer as ReturnType<typeof vi.fn>;

describe('createDeployer', () => {
  beforeEach(() => {
    // Per the `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`
    // learning, mock state can carry between `it` blocks unless explicitly
    // cleared. The constructor mocks here are persistent module-level
    // factories, so clearing their call history per-test is required to
    // keep `toHaveBeenCalledTimes(1)` honest.
    vi.clearAllMocks();
  });

  it('constructs AWSDeployer when provider is "aws"', async () => {
    await createDeployer('aws');

    expect(aws).toHaveBeenCalledTimes(1);
    expect(azure).not.toHaveBeenCalled();
    expect(gcp).not.toHaveBeenCalled();
  });

  it('constructs AzureDeployer when provider is "azure"', async () => {
    await createDeployer('azure');

    expect(azure).toHaveBeenCalledTimes(1);
    expect(aws).not.toHaveBeenCalled();
    expect(gcp).not.toHaveBeenCalled();
  });

  it('constructs GCPDeployer when provider is "gcp"', async () => {
    await createDeployer('gcp');

    expect(gcp).toHaveBeenCalledTimes(1);
    expect(aws).not.toHaveBeenCalled();
    expect(azure).not.toHaveBeenCalled();
  });

  it('falls through to GCPDeployer when provider is undefined (today\'s default)', async () => {
    await createDeployer(undefined);

    expect(gcp).toHaveBeenCalledTimes(1);
    expect(aws).not.toHaveBeenCalled();
    expect(azure).not.toHaveBeenCalled();
  });

  it('falls through to GCPDeployer for an unknown provider string (today\'s default)', async () => {
    await createDeployer('unknown-provider');

    expect(gcp).toHaveBeenCalledTimes(1);
    expect(aws).not.toHaveBeenCalled();
    expect(azure).not.toHaveBeenCalled();
  });
});

describe('getCoreEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a thenable resolving to the mocked @ice/core module shape', async () => {
    const core = await getCoreEngine();

    expect(core).toBeTruthy();
    expect(core.AWSDeployer).toBe(aws);
    expect(core.AzureDeployer).toBe(azure);
    expect(core.GCPDeployer).toBe(gcp);
  });
});
