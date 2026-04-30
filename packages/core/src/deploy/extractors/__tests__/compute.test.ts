/**
 * Tests for `extractors/compute.ts` — property extractors for GCP compute services.
 *
 * Covers each of the four extractors, exercising:
 *   - default values for missing fields
 *   - pass-through of user-supplied values
 *   - the nullish-coalescing (`??`) vs short-circuit (`||`) semantics
 *     (some fields use `??` to allow `0`/`false` through, others use `||`)
 *   - `extract_cloud_functions_properties` runs the runtime through
 *     `normalize_runtime` from name-utils
 *   - `extract_cloud_scheduler_properties` resolves the inline
 *     `schedule_map` keys (daily / hourly / weekly / monthly) to cron
 *     expressions and passes through unmapped strings unchanged
 */
import { describe, it, expect } from 'vitest';
import {
  extract_cloud_run_properties,
  extract_cloud_run_job_properties,
  extract_cloud_functions_properties,
  extract_cloud_scheduler_properties,
} from '../compute.js';

describe('extract_cloud_run_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_cloud_run_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      image: '',
      repository: '',
      branch: 'main',
      port: 8080,
      min_instances: 0,
      max_instances: 3,
      cpu: '1',
      memory: '512Mi',
      allow_unauthenticated: true,
      env_vars: {},
      labels: {},
    });
  });

  it('passes through user-supplied image, repository, branch, cpu, memory', () => {
    const result = extract_cloud_run_properties(
      {
        image: 'gcr.io/foo/bar:v1',
        repository: 'org/repo',
        branch: 'develop',
        cpu: '2',
        memory: '1Gi',
      },
      'europe-west1',
    );
    expect(result.image).toBe('gcr.io/foo/bar:v1');
    expect(result.repository).toBe('org/repo');
    expect(result.branch).toBe('develop');
    expect(result.cpu).toBe('2');
    expect(result.memory).toBe('1Gi');
    expect(result.region).toBe('europe-west1');
  });

  it('passes through port, min_instances, max_instances', () => {
    const result = extract_cloud_run_properties(
      { port: 3000, minInstances: 1, maxInstances: 10 },
      'us-east1',
    );
    expect(result.port).toBe(3000);
    expect(result.min_instances).toBe(1);
    expect(result.max_instances).toBe(10);
  });

  it('uses ?? on minInstances so explicit 0 passes through', () => {
    const result = extract_cloud_run_properties({ minInstances: 0 }, 'us-central1');
    expect(result.min_instances).toBe(0);
  });

  it('uses ?? on allowUnauthenticated so explicit false passes through', () => {
    const result = extract_cloud_run_properties({ allowUnauthenticated: false }, 'us-central1');
    expect(result.allow_unauthenticated).toBe(false);
  });

  it('passes through env_vars object', () => {
    const env = { FOO: 'bar', LEVEL: 'info' };
    const result = extract_cloud_run_properties({ envVars: env }, 'us-central1');
    expect(result.env_vars).toBe(env);
  });

  it('always returns labels: {} regardless of input', () => {
    const result = extract_cloud_run_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_cloud_run_job_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_cloud_run_job_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      image: '',
      repository: '',
      branch: 'main',
      cpu: '1',
      memory: '512Mi',
      max_retries: 3,
      timeout: '600s',
      env_vars: {},
      labels: {},
    });
  });

  it('passes through user-supplied image, repository, branch', () => {
    const result = extract_cloud_run_job_properties(
      { image: 'gcr.io/p/job:v1', repository: 'org/jobs', branch: 'main' },
      'us-east1',
    );
    expect(result.image).toBe('gcr.io/p/job:v1');
    expect(result.repository).toBe('org/jobs');
    expect(result.branch).toBe('main');
  });

  it('passes through cpu, memory, timeout', () => {
    const result = extract_cloud_run_job_properties(
      { cpu: '4', memory: '2Gi', timeout: '1800s' },
      'us-central1',
    );
    expect(result.cpu).toBe('4');
    expect(result.memory).toBe('2Gi');
    expect(result.timeout).toBe('1800s');
  });

  it('uses ?? on maxRetries so explicit 0 passes through', () => {
    const result = extract_cloud_run_job_properties({ maxRetries: 0 }, 'us-central1');
    expect(result.max_retries).toBe(0);
  });

  it('passes maxRetries through when set', () => {
    const result = extract_cloud_run_job_properties({ maxRetries: 5 }, 'us-central1');
    expect(result.max_retries).toBe(5);
  });

  it('passes through env_vars object', () => {
    const env = { JOB_NAME: 'nightly' };
    const result = extract_cloud_run_job_properties({ envVars: env }, 'us-central1');
    expect(result.env_vars).toBe(env);
  });

  it('always returns labels: {}', () => {
    const result = extract_cloud_run_job_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_cloud_functions_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_cloud_functions_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      runtime: 'nodejs20',
      memory_mb: 256,
      timeout_seconds: 30,
      entry_point: 'handler',
      trigger_type: 'http',
      env_vars: {},
      labels: {},
    });
  });

  it('normalizes "Node.js 20" → "nodejs20" via normalize_runtime', () => {
    const result = extract_cloud_functions_properties({ runtime: 'Node.js 20' }, 'us-central1');
    expect(result.runtime).toBe('nodejs20');
  });

  it('normalizes "Python 3.12" → "python312" via normalize_runtime', () => {
    const result = extract_cloud_functions_properties({ runtime: 'Python 3.12' }, 'us-central1');
    expect(result.runtime).toBe('python312');
  });

  it('falls back to "nodejs20" when normalize_runtime returns undefined (empty string)', () => {
    const result = extract_cloud_functions_properties({ runtime: '' }, 'us-central1');
    expect(result.runtime).toBe('nodejs20');
  });

  it('passes through memory, timeout, entryPoint, triggerType', () => {
    const result = extract_cloud_functions_properties(
      { memory: 512, timeout: 60, entryPoint: 'doWork', triggerType: 'pubsub' },
      'europe-west1',
    );
    expect(result.memory_mb).toBe(512);
    expect(result.timeout_seconds).toBe(60);
    expect(result.entry_point).toBe('doWork');
    expect(result.trigger_type).toBe('pubsub');
    expect(result.region).toBe('europe-west1');
  });

  it('passes through env_vars object', () => {
    const env = { LEVEL: 'debug' };
    const result = extract_cloud_functions_properties({ envVars: env }, 'us-central1');
    expect(result.env_vars).toBe(env);
  });

  it('always returns labels: {}', () => {
    const result = extract_cloud_functions_properties({ labels: { x: 'y' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_cloud_scheduler_properties', () => {
  it('returns defaults for an empty data object (schedule defaults to "daily" → cron)', () => {
    const result = extract_cloud_scheduler_properties({}, 'us-central1');
    expect(result).toEqual({
      region: 'us-central1',
      schedule: '0 0 * * *',
      timezone: 'UTC',
      target_type: 'http',
      target_uri: '',
      labels: {},
    });
  });

  it('resolves "daily" → "0 0 * * *" via the inline schedule_map', () => {
    const result = extract_cloud_scheduler_properties({ schedule: 'daily' }, 'us-central1');
    expect(result.schedule).toBe('0 0 * * *');
  });

  it('resolves "hourly" → "0 * * * *"', () => {
    const result = extract_cloud_scheduler_properties({ schedule: 'hourly' }, 'us-central1');
    expect(result.schedule).toBe('0 * * * *');
  });

  it('resolves "weekly" → "0 0 * * 0"', () => {
    const result = extract_cloud_scheduler_properties({ schedule: 'weekly' }, 'us-central1');
    expect(result.schedule).toBe('0 0 * * 0');
  });

  it('resolves "monthly" → "0 0 1 * *"', () => {
    const result = extract_cloud_scheduler_properties({ schedule: 'monthly' }, 'us-central1');
    expect(result.schedule).toBe('0 0 1 * *');
  });

  it('passes through a custom cron string unchanged when not a known key', () => {
    const result = extract_cloud_scheduler_properties(
      { schedule: '*/5 * * * *' },
      'us-central1',
    );
    expect(result.schedule).toBe('*/5 * * * *');
  });

  it('passes through timezone, targetType, targetUri', () => {
    const result = extract_cloud_scheduler_properties(
      {
        schedule: 'daily',
        timezone: 'America/Los_Angeles',
        targetType: 'pubsub',
        targetUri: 'projects/p/topics/t',
      },
      'us-east1',
    );
    expect(result.timezone).toBe('America/Los_Angeles');
    expect(result.target_type).toBe('pubsub');
    expect(result.target_uri).toBe('projects/p/topics/t');
    expect(result.region).toBe('us-east1');
  });

  it('always returns labels: {}', () => {
    const result = extract_cloud_scheduler_properties({ labels: { x: 'y' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});
