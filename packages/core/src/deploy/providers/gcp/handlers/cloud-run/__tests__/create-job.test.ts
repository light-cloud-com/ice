/**
 * Tests for `cloud-run/create-job.ts` (rf-crun-3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../image-resolver', () => ({
  resolve_image: vi.fn().mockResolvedValue('gcr.io/p/job:built'),
}));

import { create_job } from '../create-job';
import { resolve_image } from '../image-resolver';
import type { GCPHandlerContext } from '../../../types';

function clientWithCreate(operation: any) {
  return { createJob: vi.fn().mockResolvedValue([operation]) };
}

function ctxWith(jobsClient: any): GCPHandlerContext {
  const clients = new Map();
  if (jobsClient) clients.set('run.jobs', jobsClient);
  return {
    project: 'my-project',
    region: 'us-central1',
    clients,
    rest_client: { post: vi.fn(), get: vi.fn(), delete: vi.fn() } as any,
    on_step: vi.fn(),
    on_log: vi.fn(),
  } as any;
}

describe('cloud-run/create-job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolve_image).mockResolvedValue('gcr.io/p/job:built');
  });

  it('returns failure when run.jobs client is missing', async () => {
    const ctx = ctxWith(undefined);
    const out = await create_job('j', { image: 'i' }, 'us', ctx, Date.now());
    expect(out.success).toBe(false);
    expect(out.type).toBe('gcp.run.job');
    expect(out.action).toBe('create');
  });

  it('returns failure when resolve_image throws', async () => {
    vi.mocked(resolve_image).mockRejectedValueOnce(new Error('CLOUD_RUN_NO_SOURCE'));
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const ctx = ctxWith(clientWithCreate(op));
    const out = await create_job('j', {}, 'us', ctx, Date.now());
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/CLOUD_RUN_NO_SOURCE/);
  });

  it('issues createJob with the canonical body shape', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const jobs = clientWithCreate(op);
    const ctx = ctxWith(jobs);
    await create_job(
      'my-job',
      { image: 'i', cpu: '2', memory: '1Gi', max_retries: 7, timeout: '900s' },
      'europe-west4',
      ctx,
      Date.now(),
    );
    expect(jobs.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: 'projects/my-project/locations/europe-west4',
        jobId: 'my-job',
        job: expect.objectContaining({
          template: expect.objectContaining({
            template: expect.objectContaining({
              containers: [
                expect.objectContaining({
                  image: 'gcr.io/p/job:built',
                  resources: { limits: { cpu: '2', memory: '1Gi' } },
                }),
              ],
              maxRetries: 7,
              timeout: '900s',
            }),
          }),
        }),
      }),
    );
  });

  it('defaults maxRetries=3, timeout=600s, cpu=1, memory=512Mi', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const jobs = clientWithCreate(op);
    const ctx = ctxWith(jobs);
    await create_job('j', { image: 'i' }, 'us', ctx, Date.now());
    const call = jobs.createJob.mock.calls[0][0] as any;
    expect(call.job.template.template.maxRetries).toBe(3);
    expect(call.job.template.template.timeout).toBe('600s');
    expect(call.job.template.template.containers[0].resources.limits).toEqual({ cpu: '1', memory: '512Mi' });
  });

  it('reports milestone steps 3 (deploy) and 4 (wait) on the on_step callback', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const jobs = clientWithCreate(op);
    const ctx = ctxWith(jobs);
    await create_job('j', { image: 'i' }, 'us', ctx, Date.now());
    expect(ctx.on_step).toHaveBeenCalledWith('j', { label: 'Deploying job', index: 3, total: 4 });
    expect(ctx.on_step).toHaveBeenCalledWith('j', { label: 'Waiting for job to be ready', index: 4, total: 4 });
  });

  it('awaits operation.promise() before returning', async () => {
    const promiseFn = vi.fn().mockResolvedValue(undefined);
    const op = { promise: promiseFn };
    const jobs = clientWithCreate(op);
    const ctx = ctxWith(jobs);
    await create_job('j', { image: 'i' }, 'us', ctx, Date.now());
    expect(promiseFn).toHaveBeenCalled();
  });

  it('returns success shape with provider_id and deployed_image output', async () => {
    const op = { promise: vi.fn().mockResolvedValue(undefined) };
    const jobs = clientWithCreate(op);
    const ctx = ctxWith(jobs);
    const out = await create_job('j', { image: 'i' }, 'asia-east1', ctx, Date.now());
    expect(out.success).toBe(true);
    expect(out.type).toBe('gcp.run.job');
    expect(out.action).toBe('create');
    expect(out.provider_id).toBe('projects/my-project/locations/asia-east1/jobs/j');
    expect(out.outputs).toEqual({ deployed_image: 'gcr.io/p/job:built' });
  });
});
