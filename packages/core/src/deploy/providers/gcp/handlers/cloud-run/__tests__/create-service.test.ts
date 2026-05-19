/**
 * Tests for `cloud-run/create-service.ts` (rf-crun-3). Mocks every
 * sibling helper so the orchestrator's pipeline is verified
 * independently of resolve_image, fetch_service_outputs, and the IAM
 * grant — those have their own unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../image-resolver', () => ({
  resolve_image: vi.fn().mockResolvedValue('gcr.io/p/x:built'),
}));
vi.mock('../utils', async (orig) => {
  const real = (await orig()) as any;
  return {
    ...real,
    fetch_service_outputs: vi.fn().mockResolvedValue({ url: 'https://x.run.app', deployed_image: 'gcr.io/p/x:built' }),
  };
});
vi.mock('../iam', () => ({
  grant_public_access: vi.fn().mockResolvedValue(undefined),
}));

import { create_service } from '../create-service';
import { grant_public_access } from '../iam';
import { resolve_image } from '../image-resolver';
import { fetch_service_outputs } from '../utils';
import type { GCPHandlerContext } from '../../../types';

function clientWithCreate(operation: any) {
  return {
    createService: vi.fn().mockResolvedValue([operation]),
  };
}

function ctxWith(servicesClient: any, overrides: Partial<GCPHandlerContext> = {}): GCPHandlerContext {
  const clients = new Map();
  if (servicesClient) clients.set('run.services', servicesClient);
  return {
    project: 'my-project',
    region: 'us-central1',
    clients,
    rest_client: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } as any,
    on_step: vi.fn(),
    on_log: vi.fn(),
    ...overrides,
  } as any;
}

describe('cloud-run/create-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolve_image).mockResolvedValue('gcr.io/p/x:built');
    vi.mocked(fetch_service_outputs).mockResolvedValue({
      url: 'https://x.run.app',
      deployed_image: 'gcr.io/p/x:built',
    });
    vi.mocked(grant_public_access).mockResolvedValue(undefined);
  });

  it('returns failure when run.services client is missing', async () => {
    const ctx = ctxWith(undefined);
    const out = await create_service('x', { image: 'gcr.io/p/x:1' }, 'us-central1', ctx, Date.now());
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Cloud Run/i);
    expect(out.type).toBe('gcp.run.service');
    expect(out.action).toBe('create');
  });

  it('returns failure when resolve_image throws (e.g. no source provided)', async () => {
    vi.mocked(resolve_image).mockRejectedValueOnce(new Error('CLOUD_RUN_NO_SOURCE'));
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const ctx = ctxWith(clientWithCreate(op));
    const out = await create_service('x', {}, 'us-central1', ctx, Date.now());
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/CLOUD_RUN_NO_SOURCE/);
  });

  it('calls services.createService with the correct body for a simple deploy', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service(
      'x',
      { image: 'gcr.io/p/x:1', port: 9090, cpu: '2', memory: '1Gi', min_instances: 1, max_instances: 5 },
      'europe-west4',
      ctx,
      Date.now(),
    );
    expect(services.createService).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: 'projects/my-project/locations/europe-west4',
        serviceId: 'x',
        service: expect.objectContaining({
          invokerIamDisabled: true,
          template: expect.objectContaining({
            containers: [
              expect.objectContaining({
                image: 'gcr.io/p/x:built',
                ports: [{ containerPort: 9090 }],
                resources: { limits: { cpu: '2', memory: '1Gi' } },
              }),
            ],
            scaling: { minInstanceCount: 1, maxInstanceCount: 5 },
          }),
        }),
      }),
    );
  });

  it('defaults port=8080, cpu=1, memory=512Mi, min=0, max=3', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service('x', { image: 'gcr.io/p/x:1' }, 'us', ctx, Date.now());
    const call = services.createService.mock.calls[0][0] as any;
    expect(call.service.template.containers[0].ports).toEqual([{ containerPort: 8080 }]);
    expect(call.service.template.containers[0].resources.limits).toEqual({ cpu: '1', memory: '512Mi' });
    expect(call.service.template.scaling).toEqual({ minInstanceCount: 0, maxInstanceCount: 3 });
  });

  it('passes invokerIamDisabled=false when allow_unauthenticated === false', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service('x', { image: 'gcr.io/p/x:1', allow_unauthenticated: false }, 'us', ctx, Date.now());
    const call = services.createService.mock.calls[0][0] as any;
    expect(call.service.invokerIamDisabled).toBe(false);
  });

  it('reports milestone steps 3 (deploy) and 4 (wait) on the on_step callback', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service('x', { image: 'i' }, 'us', ctx, Date.now());
    expect(ctx.on_step).toHaveBeenCalledWith('x', { label: 'Deploying revision', index: 3, total: 4 });
    expect(ctx.on_step).toHaveBeenCalledWith('x', {
      label: 'Waiting for revision to serve traffic',
      index: 4,
      total: 4,
    });
  });

  it('awaits the operation.promise() before returning', async () => {
    const promiseFn = vi.fn().mockResolvedValue(undefined);
    const op = { promise: promiseFn };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service('x', { image: 'i' }, 'us', ctx, Date.now());
    expect(promiseFn).toHaveBeenCalled();
  });

  it('returns the success shape with provider_id and outputs', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    const out = await create_service('my-svc', { image: 'i' }, 'us-central1', ctx, Date.now());
    expect(out.success).toBe(true);
    expect(out.type).toBe('gcp.run.service');
    expect(out.action).toBe('create');
    expect(out.provider_id).toBe('projects/my-project/locations/us-central1/services/my-svc');
    expect(out.outputs).toEqual({ url: 'https://x.run.app', deployed_image: 'gcr.io/p/x:built' });
  });

  it('calls grant_public_access after the deploy', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const services = clientWithCreate(op);
    const ctx = ctxWith(services);
    await create_service('x', { image: 'i' }, 'us', ctx, Date.now());
    expect(grant_public_access).toHaveBeenCalledWith(
      ctx,
      'projects/my-project/locations/us/services/x',
      expect.objectContaining({ image: 'i' }),
    );
  });
});
