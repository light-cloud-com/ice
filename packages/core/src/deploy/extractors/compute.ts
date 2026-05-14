/**
 * Property extractors for compute services on the card-to-graph translator.
 *
 * Each extractor maps a canvas node's `data` payload to the deployer-handler
 * input shape for a specific GCP compute resource type. The translator's
 * dispatch table looks up the right extractor by resolved `resource_type`.
 *
 * Loose `Record<string, unknown>` types on the parameter and return value
 * are intentional — handlers further down the pipeline coerce per-resource.
 */

import { normalize_runtime } from '../utils/name-utils';

export function extract_cloud_run_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    port: data.port || 8080,
    min_instances: data.minInstances ?? 0,
    max_instances: data.maxInstances ?? 3,
    cpu: data.cpu || '1',
    memory: data.memory || '512Mi',
    allow_unauthenticated: data.allowUnauthenticated ?? true,
    env_vars: data.envVars || {},
    labels: {},
  };
}

export function extract_cloud_run_job_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    cpu: data.cpu || '1',
    memory: data.memory || '512Mi',
    max_retries: data.maxRetries ?? 3,
    timeout: data.timeout || '600s',
    env_vars: data.envVars || {},
    labels: {},
  };
}

export function extract_cloud_functions_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    runtime: normalize_runtime(data.runtime as string) || 'nodejs20',
    memory_mb: data.memory || 256,
    timeout_seconds: data.timeout || 30,
    entry_point: data.entryPoint || 'handler',
    trigger_type: data.triggerType || 'http',
    env_vars: data.envVars || {},
    labels: {},
  };
}

export function extract_cloud_scheduler_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const schedule_map: Record<string, string> = {
    daily: '0 0 * * *',
    hourly: '0 * * * *',
    weekly: '0 0 * * 0',
    monthly: '0 0 1 * *',
  };
  const schedule = (data.schedule as string) || 'daily';

  return {
    region,
    schedule: schedule_map[schedule] || schedule,
    timezone: data.timezone || 'UTC',
    target_type: data.targetType || 'http',
    target_uri: data.targetUri || '',
    labels: {},
  };
}
