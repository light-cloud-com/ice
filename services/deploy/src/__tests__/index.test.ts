/**
 * Smoke test for the services/deploy barrel + createDeployRouter.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {},
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({})),
  Worker: vi.fn(() => ({ on: vi.fn() })),
  QueueEvents: vi.fn(() => ({ on: vi.fn() })),
}));

import { createDeployRouter } from '../index';
import * as Deploy from '../index';

describe('services/deploy barrel', () => {
  it('exposes createDeployRouter as a function', () => {
    expect(typeof createDeployRouter).toBe('function');
  });

  it('createDeployRouter returns an express router', () => {
    const router = createDeployRouter();
    expect(router).toBeDefined();
    expect(typeof (router as any).use).toBe('function');
  });

  it('re-exports queue/cron helpers', () => {
    expect(typeof (Deploy as any).startDeployWorker).toBe('function');
    expect(typeof (Deploy as any).queueDeployment).toBe('function');
    expect(typeof (Deploy as any).getDeployQueue).toBe('function');
    expect(typeof (Deploy as any).startCronJobs).toBe('function');
    expect(typeof (Deploy as any).cleanupAllTempDirs).toBe('function');
    expect(typeof (Deploy as any).startRequirementPoller).toBe('function');
    expect(typeof (Deploy as any).stopRequirementPoller).toBe('function');
    expect(typeof (Deploy as any).cleanupOrphanedIceResources).toBe('function');
  });
});
