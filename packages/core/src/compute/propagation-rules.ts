/**
 * Propagation Rules — declarative data flow definitions.
 *
 * Each rule says: "when source(iceType) is connected to target(iceType),
 * compute these derived properties on the receiving node."
 *
 * This is the computing-flows equivalent of CONNECTION_RULES — one array
 * that is the single source of truth for all reactive property propagation.
 */

import { DEFAULT_PORTS, DEFAULT_ENV_VARS } from '@ice/constants';
import type {
  PropagationRule,
  AggregateRule,
  PropagationNode,
} from './types.js';

// ─── Block Type Classifiers ─────────────────────────────────────────────────
// Minimal copies of the classifiers from @ice/types/connection-rules.
// Kept local to avoid cross-package moduleResolution conflicts.

function isBackend(t: string): boolean {
  return (
    /Backend|Container|Worker|Function|CronJob|Scheduled|AppPlatform|OCIFunctions/i.test(t) ||
    t.startsWith('Compute.')
  );
}
function isFrontend(t: string): boolean {
  return /StaticSite|SSRSite|Frontend/i.test(t);
}
function isService(t: string): boolean {
  return isBackend(t) || isFrontend(t);
}
function isDatabase(t: string): boolean {
  return (
    t.startsWith('Database.') ||
    /PostgreSQL|MySQL|MongoDB|DynamoDB|Firestore|CosmosDB|AutonomousDB|Tablestore|ManagedDB/i.test(t)
  );
}
function isCache(t: string): boolean {
  return /Redis|Cache|Memcache/i.test(t);
}
function isStorage(t: string): boolean {
  return t.startsWith('Storage.') || /Bucket|S3|GCS|Blob|ObjectStorage|Spaces/i.test(t);
}
function isQueue(t: string): boolean {
  return t.startsWith('Messaging.') || /Queue|SQS|SNS|PubSub|ServiceBus|RabbitMQ|Kafka|Event/i.test(t);
}
function isSearch(t: string): boolean {
  return /Search|Elasticsearch/i.test(t) || t === 'Analytics.Search';
}
function isVectorDb(t: string): boolean {
  return /VectorDB|Vector/i.test(t) || t === 'AI.VectorDB';
}
function isLLM(t: string): boolean {
  return /LLM|ModelServing/i.test(t) || t === 'AI.LLMGateway' || t === 'AI.ModelServing';
}
function isDataWarehouse(t: string): boolean {
  return /Warehouse|BigQuery|Redshift|Synapse/i.test(t) || t === 'Analytics.DataWarehouse';
}
function isRepo(t: string): boolean {
  return t === 'Source.Repository';
}
function isEnvConfig(t: string): boolean {
  return t === 'Config.Environment';
}
function isSecrets(t: string): boolean {
  return /Secret|Vault|Certificate/i.test(t) || t === 'Security.Secret';
}
function isCustomDomain(t: string): boolean {
  return t === 'Network.CustomDomain';
}

/** Anything that stores data and should restrict network access */
function isDataStore(t: string): boolean {
  return isDatabase(t) || isCache(t) || isStorage(t) || isSearch(t) || isVectorDb(t) || isDataWarehouse(t);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function iceType(node: PropagationNode): string {
  return (node.data?.iceType as string) || '';
}

// ─── Per-Edge Propagation Rules ─────────────────────────────────────────────

export const PROPAGATION_RULES: PropagationRule[] = [
  // ── Domain sync: CustomDomain → Compute ───────────────────────────────
  {
    label: 'CustomDomain → Service: domain propagation',
    source: isCustomDomain,
    target: (t) => isBackend(t) || isFrontend(t),
    direction: 'source→target',
    compute(src, _tgt, edge) {
      const rootDomain = String(src.data?.domain || '').trim();
      if (!rootDomain || rootDomain === 'example.com') return null;

      const routeId = edge.data?.routeId as string | undefined;
      let subdomain: string;
      if (routeId) {
        const routes = (src.data?.routes as Array<{ id: string; subdomain: string }>) || [];
        const route = routes.find((r) => r.id === routeId);
        if (!route) return null; // orphan edge — handled by edge cleanup
        subdomain = (route.subdomain || '').trim();
      } else {
        subdomain = ((edge.data?.subdomain as string) || '').trim();
      }

      const fullHost = subdomain ? `${subdomain}.${rootDomain}` : rootDomain;
      // Write both `domain` (used by deploy translator + banner) and
      // `custom_domain` (rendered in the properties panel as "Custom domain").
      return { domain: fullHost, custom_domain: fullHost };
    },
  },

  // ── Repo sync: Source.Repository → Service ────────────────────────────
  {
    label: 'Repository → Service: source code propagation',
    source: isRepo,
    target: isService,
    direction: 'source→target',
    compute(src) {
      const repo = (src.data?.repository as string) || '';
      if (!repo) return null;

      const patch: Record<string, unknown> = {
        repository: repo,
        branch: (src.data?.branch as string) || 'main',
      };
      if (src.data?.buildCommand) patch.buildCommand = src.data.buildCommand;
      if (src.data?.outputDirectory) patch.outputDirectory = src.data.outputDirectory;
      return patch;
    },
  },

  // ── Secret injection: Service → Secret (config edge, secret is target) ─
  //    Connection model: Service ---config--→ Secret (service depends on secret)
  //    Propagation: secret refs flow from Secret back to Service
  {
    label: 'Service → Secret: inject secret references',
    source: isService,
    target: isSecrets,
    direction: 'target→source', // Secret's data flows back to the Service
    compute(_serviceSrc, secretTgt) {
      const secrets = (secretTgt.data?.secrets as Array<{ key: string; ref?: string }>) || [];
      if (secrets.length === 0) return null;
      return {
        secretRefs: secrets.map((s) => ({
          envVar: s.key,
          secretName: s.ref || s.key,
        })),
      };
    },
  },

  // ── Env config injection: Service → EnvConfig ─────────────────────────
  {
    label: 'Service → EnvConfig: inject environment variables',
    source: isService,
    target: isEnvConfig,
    direction: 'target→source', // EnvConfig's data flows back to Service
    compute(_serviceSrc, envTgt) {
      const envVars = (envTgt.data?.variables as Record<string, string>) || {};
      if (Object.keys(envVars).length === 0) return null;
      return { injectedEnvVars: envVars };
    },
  },

  // ── Connection string: Backend → Database/Cache ───────────────────────
  //    When a backend connects to a data store, derive the env var name
  //    and port from the TREE so the service knows how to connect.
  {
    label: 'Backend → DataStore: connection string propagation',
    source: isBackend,
    target: isDataStore,
    direction: 'source→target',
    compute(_src, tgt, edge) {
      const tgtType = iceType(tgt);
      const port = edge.data?.port || DEFAULT_PORTS[tgtType];
      const envVarName = edge.data?.envVarName || DEFAULT_ENV_VARS[tgtType];
      if (!port && !envVarName) return null;

      return {
        ...(port && { port }),
        ...(envVarName && { envVarName }),
      };
    },
  },

  // ── Queue connection: Backend → Queue ─────────────────────────────────
  {
    label: 'Backend → Queue: env var propagation',
    source: isBackend,
    target: isQueue,
    direction: 'source→target',
    compute(_src, tgt, edge) {
      const tgtType = iceType(tgt);
      const envVarName = edge.data?.envVarName || DEFAULT_ENV_VARS[tgtType];
      if (!envVarName) return null;
      return { envVarName };
    },
  },

  // ── LLM/AI connection: Backend → LLM/VectorDB ────────────────────────
  {
    label: 'Backend → AI service: env var propagation',
    source: isBackend,
    target: (t) => isLLM(t) || isVectorDb(t),
    direction: 'source→target',
    compute(_src, tgt, edge) {
      const tgtType = iceType(tgt);
      const envVarName = edge.data?.envVarName || DEFAULT_ENV_VARS[tgtType];
      if (!envVarName) return null;
      return { envVarName };
    },
  },
];

// ─── Aggregate Rules (per-node, all edges) ──────────────────────────────────

export const AGGREGATE_RULES: AggregateRule[] = [
  // ── Network Policy: compute allowedClients for data stores ────────────
  //    "If PostgresDB is connected to Backend A, only A can send requests"
  {
    label: 'DataStore: derive allowedClients from inbound traffic edges',
    appliesTo: isDataStore,
    compute(_node, inboundEdges) {
      const trafficSources = inboundEdges
        .filter((e) => (e.edge.data?.connectionCategory || '') === 'traffic')
        .map((e) => ({
          nodeId: e.sourceNode.id,
          label: (e.sourceNode.data?.label as string) || e.sourceNode.id,
          iceType: iceType(e.sourceNode),
        }));

      return { allowedClients: trafficSources };
    },
  },

  // ── Network Policy: compute allowedClients for queues ─────────────────
  {
    label: 'Queue: derive allowedClients from connected services',
    appliesTo: isQueue,
    compute(_node, inboundEdges, outboundEdges) {
      const publishers = inboundEdges
        .filter((e) => (e.edge.data?.connectionCategory || '') === 'traffic')
        .map((e) => ({
          nodeId: e.sourceNode.id,
          label: (e.sourceNode.data?.label as string) || e.sourceNode.id,
          iceType: iceType(e.sourceNode),
          role: 'publisher' as const,
        }));

      const subscribers = outboundEdges
        .filter((e) => (e.edge.data?.connectionCategory || '') === 'traffic')
        .map((e) => ({
          nodeId: e.targetNode.id,
          label: (e.targetNode.data?.label as string) || e.targetNode.id,
          iceType: iceType(e.targetNode),
          role: 'subscriber' as const,
        }));

      return { allowedClients: [...publishers, ...subscribers] };
    },
  },

  // ── Network Policy: compute allowedTargets for services ───────────────
  //    The inverse view — what can this service talk to?
  {
    label: 'Service: derive allowedTargets from outbound traffic edges',
    appliesTo: isService,
    compute(_node, _inbound, outboundEdges) {
      const targets = outboundEdges
        .filter((e) => (e.edge.data?.connectionCategory || '') === 'traffic')
        .map((e) => ({
          nodeId: e.targetNode.id,
          label: (e.targetNode.data?.label as string) || e.targetNode.id,
          iceType: iceType(e.targetNode),
        }));

      return { allowedTargets: targets };
    },
  },
];
