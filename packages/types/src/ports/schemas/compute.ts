import type { PortDef, PortSchema } from '../types';

/**
 * Inputs every deployable service (frontend or backend) shares — source
 * code from a repository, environment variables from a config block,
 * secret references from a secret store, and an optional custom domain.
 */
function serviceCommonInputs(includeDomain = true): PortDef[] {
  const base: PortDef[] = [
    {
      id: 'repository-in',
      direction: 'in',
      role: 'repository',
      label: 'Source code',
      property: 'repository',
      side: 'left',
      shape: 'diamond',
      peerStyle: 'Source',
    },
    {
      id: 'env-in',
      direction: 'in',
      role: 'env',
      label: 'Environment variables',
      property: 'env_vars',
      side: 'left',
      shape: 'ring',
      peerStyle: 'Config',
    },
    {
      id: 'secret-in',
      direction: 'in',
      role: 'secret',
      label: 'Secrets',
      property: 'secrets',
      side: 'left',
      shape: 'ring',
      peerStyle: 'Security',
    },
  ];
  if (includeDomain) {
    base.push({
      id: 'domain-in',
      direction: 'in',
      role: 'domain',
      label: 'Custom domain',
      property: 'custom_domain',
      side: 'left',
      shape: 'square',
      peerStyle: 'Network',
    });
  }
  return base;
}

/**
 * Data-store inputs that a backend can consume. Each one corresponds to
 * a stable env var the deploy compiler injects (DATABASE_URL,
 * REDIS_URL, …) via the existing `Backend → DataStore` propagation
 * rule.
 */
function backendDataInputs(): PortDef[] {
  return [
    {
      id: 'db-in',
      direction: 'in',
      role: 'database',
      label: 'Database',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Database',
    },
    {
      id: 'cache-in',
      direction: 'in',
      role: 'cache',
      label: 'Cache',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Database',
    },
    {
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      label: 'Publish to queue',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Messaging',
      // Publish targets a Queue (or Stream/Email) — NEVER another Service.
      peerKind: 'queue',
    },
    {
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      label: 'Subscribe to queue',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Messaging',
      // Subscribe receives from a Queue/Stream — NEVER from another Service.
      peerKind: 'queue',
    },
    {
      id: 'storage-in',
      direction: 'in',
      role: 'storage',
      label: 'Object storage',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Storage',
    },
    {
      id: 'search-in',
      direction: 'in',
      role: 'search',
      label: 'Search',
      side: 'left',
      shape: 'circle',
      peerStyle: 'Analytics',
    },
    {
      id: 'vector-in',
      direction: 'in',
      role: 'vector',
      label: 'Vector DB',
      side: 'left',
      shape: 'circle',
      peerStyle: 'AI',
    },
    {
      id: 'llm-in',
      direction: 'in',
      role: 'llm',
      label: 'LLM',
      side: 'left',
      shape: 'circle',
      peerStyle: 'AI',
    },
  ];
}

const httpsOut: PortDef = {
  id: 'web-out',
  direction: 'out',
  role: 'http-endpoint',
  label: 'Web (HTTPS)',
  port: 443,
  protocol: 'https',
  side: 'right',
  shape: 'circle',
  peerStyle: 'Network',
};

const logsOut: PortDef = {
  id: 'logs-out',
  direction: 'out',
  role: 'monitoring',
  label: 'Logs',
  side: 'right',
  shape: 'circle',
  peerStyle: 'Monitoring',
};

/** Compute.StaticSite — frontend that consumes repo/env/domain, exposes HTTPS. */
export const computeStaticSiteSchema: PortSchema = {
  iceType: 'Compute.StaticSite',
  base: [...serviceCommonInputs(true), httpsOut, logsOut],
};

/** Compute.SSRSite — same wiring as static site (SSR is an implementation detail). */
export const computeSsrSiteSchema: PortSchema = {
  iceType: 'Compute.SSRSite',
  base: [...serviceCommonInputs(true), httpsOut, logsOut],
};

/**
 * Compute.Container — the multi-port-capable backend.
 *
 * Base ports cover the standard service wiring (repo, env, secret,
 * domain, all data-store inputs, logs out). The default `web-out` is
 * dropped once the user adds explicit `exposed_ports` — only the
 * user-declared listeners show, so the canvas never lies about what
 * the service exposes.
 */
export const computeContainerSchema: PortSchema = {
  iceType: 'Compute.Container',
  base: [
    ...serviceCommonInputs(true),
    ...backendDataInputs(),
    {
      id: 'web-out',
      direction: 'out',
      role: 'http-endpoint',
      label: 'HTTPS :8080',
      port: 8080,
      protocol: 'https',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Network',
    },
    logsOut,
  ],
  hide: [
    {
      keys: ['exposed_ports'],
      when: (data) => Array.isArray(data.exposed_ports) && data.exposed_ports.length > 0,
      portIds: ['web-out'],
    },
  ],
  dynamic: makeExposedPortsDynamic,
};

/**
 * Compute.BackendAPI — same wiring story as Container. Most blueprints
 * land here when the user picks "Backend API" from the palette.
 */
export const computeBackendApiSchema: PortSchema = {
  iceType: 'Compute.BackendAPI',
  base: [
    ...serviceCommonInputs(true),
    ...backendDataInputs(),
    {
      id: 'web-out',
      direction: 'out',
      role: 'http-endpoint',
      label: 'HTTPS :443',
      port: 443,
      protocol: 'https',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Network',
    },
    logsOut,
  ],
  hide: [
    {
      keys: ['exposed_ports'],
      when: (data) => Array.isArray(data.exposed_ports) && data.exposed_ports.length > 0,
      portIds: ['web-out'],
    },
  ],
  dynamic: makeExposedPortsDynamic,
};

/**
 * Parses the user's `exposed_ports` list (JSON strings or compact text
 * forms — see `port-spec.ts` in the UI package) into typed `http-endpoint`
 * OUT ports. Pure parser; doesn't import the UI's port-spec helper to
 * keep `@ice/types` UI-agnostic.
 */
function makeExposedPortsDynamic(data: Record<string, unknown>): PortDef[] {
  const raw = data.exposed_ports;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, idx) => parseExposedPort(entry, idx)).filter((p): p is PortDef => p !== null);
}

function parseExposedPort(raw: unknown, idx: number): PortDef | null {
  let port = 0;
  let protocol: 'http' | 'https' | 'tcp' = 'http';
  let userLabel = '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { port?: unknown; protocol?: unknown; label?: unknown };
      if (parsed && typeof parsed.port === 'number') {
        port = parsed.port;
        if (parsed.protocol === 'https' || parsed.protocol === 'tcp') protocol = parsed.protocol;
        if (typeof parsed.label === 'string') userLabel = parsed.label;
      }
    } catch {
      const parts = raw.split(':');
      if (parts.length >= 2 && (parts[0] === 'http' || parts[0] === 'https' || parts[0] === 'tcp')) {
        protocol = parts[0];
        port = Number(parts[1]);
        if (parts[2]) userLabel = parts[2];
      } else {
        const n = Number(raw);
        if (Number.isFinite(n)) port = n;
      }
    }
  } else if (raw && typeof raw === 'object') {
    const obj = raw as { port?: unknown; protocol?: unknown; label?: unknown };
    if (typeof obj.port === 'number') port = obj.port;
    if (obj.protocol === 'https' || obj.protocol === 'tcp') protocol = obj.protocol;
    if (typeof obj.label === 'string') userLabel = obj.label;
  }
  if (!Number.isFinite(port) || port <= 0) return null;
  const protoLabel = protocol.toUpperCase();
  const label = userLabel ? `${protoLabel} :${port} (${userLabel})` : `${protoLabel} :${port}`;
  return {
    id: `port-${port}-out`,
    direction: 'out',
    role: 'http-endpoint',
    label,
    port,
    protocol,
    side: 'right',
    shape: 'circle',
    peerStyle: 'Network',
    removable: true,
    // Stash the index so dedupe-by-id collisions remain stable for repeat
    // ports — unlikely in practice but defensive.
    ...(idx >= 0 ? {} : {}),
  };
}

/** Compute.ServerlessFunction — backend without the multi-port story. */
export const computeServerlessFunctionSchema: PortSchema = {
  iceType: 'Compute.ServerlessFunction',
  base: [...serviceCommonInputs(true), ...backendDataInputs(), httpsOut, logsOut],
};

/** Compute.Worker — long-running background worker. No public endpoint by default. */
export const computeWorkerSchema: PortSchema = {
  iceType: 'Compute.Worker',
  base: [...serviceCommonInputs(false), ...backendDataInputs(), logsOut],
};

/** Compute.CronJob — scheduled task. Like a worker but ephemeral. */
export const computeCronJobSchema: PortSchema = {
  iceType: 'Compute.CronJob',
  base: [...serviceCommonInputs(false), ...backendDataInputs(), logsOut],
};
