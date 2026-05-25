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

/**
 * Parses the `exposed_ports` array from `data` into typed entries.
 * Each entry is either a JSON string (`{port, protocol, label?}`) or
 * a compact text form (`"https:443"`, `"https:443:api"`) — matches
 * `port-spec.ts` in the UI package. Returns `[]` for absent / malformed
 * data so callers can safely default.
 */
export interface ExposedPort {
  port: number;
  protocol: 'http' | 'https' | 'tcp';
  label?: string;
}

export function parse_exposed_ports(data: Record<string, unknown>): ExposedPort[] {
  const raw = data.exposed_ports;
  if (!Array.isArray(raw)) return [];
  const out: ExposedPort[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      try {
        const parsed = JSON.parse(entry) as { port?: unknown; protocol?: unknown; label?: unknown };
        if (parsed && typeof parsed.port === 'number' && parsed.port > 0) {
          const protocol: ExposedPort['protocol'] =
            parsed.protocol === 'https' || parsed.protocol === 'tcp' ? parsed.protocol : 'http';
          out.push({
            port: parsed.port,
            protocol,
            ...(typeof parsed.label === 'string' && parsed.label ? { label: parsed.label } : {}),
          });
          continue;
        }
      } catch {
        /* fall through to compact form */
      }
      const parts = entry.split(':');
      if (parts.length >= 2 && (parts[0] === 'http' || parts[0] === 'https' || parts[0] === 'tcp')) {
        const p = Number(parts[1]);
        if (Number.isFinite(p) && p > 0) {
          out.push({
            port: p,
            protocol: parts[0] as ExposedPort['protocol'],
            ...(parts[2] ? { label: parts[2] } : {}),
          });
        }
      }
    } else if (entry && typeof entry === 'object') {
      const obj = entry as { port?: unknown; protocol?: unknown; label?: unknown };
      if (typeof obj.port === 'number' && obj.port > 0) {
        const protocol: ExposedPort['protocol'] =
          obj.protocol === 'https' || obj.protocol === 'tcp' ? obj.protocol : 'http';
        out.push({
          port: obj.port,
          protocol,
          ...(typeof obj.label === 'string' && obj.label ? { label: obj.label } : {}),
        });
      }
    }
  }
  return out;
}

export function extract_cloud_run_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  // Multi-port: when the user declares `exposed_ports` on a Container /
  // BackendAPI block, the first entry becomes the primary listener and
  // the full list is forwarded as `additional_ports` so the deployer
  // can configure all of them (e.g. Container App ingress / ECS
  // listener rules). Legacy `data.port` scalar is the back-compat
  // fallback for blocks that haven't set `exposed_ports`.
  const ports = parse_exposed_ports(data);
  const primaryPort = ports[0]?.port ?? (data.port as number | undefined) ?? 8080;
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    port: primaryPort,
    ...(ports.length > 0 && { additional_ports: ports }),
    min_instances: data.minInstances ?? 0,
    max_instances: data.maxInstances ?? 3,
    cpu: data.cpu || '1',
    memory: data.memory || '512Mi',
    allow_unauthenticated: data.allowUnauthenticated ?? true,
    env_vars: data.envVars || {},
    labels: {},
  };
}

export function extract_cloud_run_job_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
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

export function extract_cloud_functions_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
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

export function extract_cloud_scheduler_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
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
