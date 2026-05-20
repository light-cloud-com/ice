/**
 * Block Type Classifiers
 *
 * Local copies of the classifier functions from @ice/types/connection-rules.
 * Inlined here because @ice/core uses NodeNext moduleResolution while
 * @ice/types uses bundler resolution — the re-exports don't cross cleanly.
 *
 * These are trivially small and change rarely. If they diverge,
 * the connection validation tests will catch it.
 *
 * The network-container set is the one piece that IS shared via
 * `@ice/constants:NETWORK_CONTAINER_TYPES` — so a new container type
 * (e.g. a future Network.PrivateLink) flips both `isContainer` predicates
 * in lockstep without touching this file. The non-network predicate
 * regexes still need a sync pass when changed.
 */

import { NETWORK_CONTAINER_TYPES } from '@ice/constants';

export function isDatabase(t: string): boolean {
  return (
    t.startsWith('Database.') ||
    /PostgreSQL|MySQL|MongoDB|DynamoDB|Firestore|CosmosDB|AutonomousDB|Tablestore|ManagedDB/i.test(t)
  );
}

export function isCache(t: string): boolean {
  return /Redis|Cache|Memcache/i.test(t);
}

export function isQueue(t: string): boolean {
  return t.startsWith('Messaging.') || /Queue|SQS|SNS|PubSub|ServiceBus|RabbitMQ|Kafka|Event/i.test(t);
}

export function isStorage(t: string): boolean {
  return t.startsWith('Storage.') || /Bucket|S3|GCS|Blob|ObjectStorage|Spaces/i.test(t);
}

export function isBackend(t: string): boolean {
  return (
    /Backend|Container|Worker|Function|CronJob|Scheduled|AppPlatform|OCIFunctions/i.test(t) || t.startsWith('Compute.')
  );
}

export function isFrontend(t: string): boolean {
  return /StaticSite|SSRSite|Frontend/i.test(t);
}

export function isGateway(t: string): boolean {
  return /Gateway|LoadBalancer|Internet|WAF/i.test(t) || t === 'Network.Gateway';
}

export function isAuth(t: string): boolean {
  return /Auth|Identity|IAM/i.test(t) || t === 'Security.Identity';
}

export function isSecrets(t: string): boolean {
  return /Secret|Vault|Certificate/i.test(t) || t === 'Security.Secret';
}

export function isMonitoring(t: string): boolean {
  return /Log|Monitor|Observability|Terminal/i.test(t) || t.startsWith('Monitoring.') || t.startsWith('Log.');
}

export function isSearch(t: string): boolean {
  return /Search|Elasticsearch/i.test(t) || t === 'Analytics.Search';
}

export function isVectorDb(t: string): boolean {
  return /VectorDB|Vector/i.test(t) || t === 'AI.VectorDB';
}

export function isLLM(t: string): boolean {
  return /LLM|ModelServing/i.test(t) || t === 'AI.LLMGateway' || t === 'AI.ModelServing';
}

export function isRepo(t: string): boolean {
  return t === 'Source.Repository';
}

export function isEnvConfig(t: string): boolean {
  return t === 'Config.Environment';
}

export function isDomain(t: string): boolean {
  return t === 'Network.PublicEndpoint' || /Domain|DNS/i.test(t);
}

export function isContainer(iceType: string, nodeType?: string): boolean {
  if (nodeType === 'container' || nodeType === 'group') return true;
  return (NETWORK_CONTAINER_TYPES as readonly string[]).includes(iceType) || iceType.startsWith('Group.');
}

function isService(t: string): boolean {
  return isBackend(t) || isFrontend(t);
}

/**
 * Check if two block types can be connected.
 * Mirrors canConnect() from @ice/types/connection-rules.
 */
export function canConnect(
  srcIceType: string,
  tgtIceType: string,
  srcNodeType?: string,
  tgtNodeType?: string,
): boolean {
  if (isContainer(srcIceType, srcNodeType) || isContainer(tgtIceType, tgtNodeType)) return false;

  // Check all valid connection rules
  const rules: Array<{ source: (t: string) => boolean; target: (t: string) => boolean }> = [
    // Traffic: request
    { source: isFrontend, target: isBackend },
    { source: isGateway, target: isGateway },
    { source: isGateway, target: isBackend },
    { source: isGateway, target: isFrontend },
    { source: isBackend, target: isBackend },
    { source: isBackend, target: isAuth },
    { source: isFrontend, target: isAuth },
    { source: isFrontend, target: isGateway },
    // Traffic: data
    { source: isBackend, target: isDatabase },
    { source: isBackend, target: isCache },
    { source: isBackend, target: isStorage },
    { source: isBackend, target: isSearch },
    { source: isBackend, target: isVectorDb },
    { source: isBackend, target: isLLM },
    { source: isFrontend, target: isStorage },
    // Traffic: data (reverse)
    { source: isDatabase, target: isBackend },
    { source: isCache, target: isBackend },
    { source: isStorage, target: isBackend },
    { source: isStorage, target: isFrontend },
    { source: isSearch, target: isBackend },
    { source: isVectorDb, target: isBackend },
    { source: isLLM, target: isBackend },
    { source: isAuth, target: isBackend },
    { source: isAuth, target: isFrontend },
    // Traffic: publish/subscribe
    { source: isBackend, target: isQueue },
    { source: isQueue, target: isBackend },
    {
      source: isBackend,
      target: (t: string) => /Warehouse|BigQuery|Redshift|Synapse/i.test(t) || t === 'Analytics.DataWarehouse',
    },
    {
      source: (t: string) => /Warehouse|BigQuery|Redshift|Synapse/i.test(t) || t === 'Analytics.DataWarehouse',
      target: isBackend,
    },
    // Traffic: stream
    { source: (t: string) => !isMonitoring(t) && !isContainer(t), target: isMonitoring },
    // Pipeline
    { source: isRepo, target: isService },
    { source: isService, target: isRepo },
    // Config
    { source: isService, target: isEnvConfig },
    { source: isService, target: isSecrets },
    { source: isEnvConfig, target: isService },
    { source: isSecrets, target: isService },
    // DNS
    { source: isDomain, target: (t: string) => isBackend(t) || isFrontend(t) || isGateway(t) },
    { source: (t: string) => isBackend(t) || isFrontend(t) || isGateway(t), target: isDomain },
  ];

  return rules.some((r) => r.source(srcIceType) && r.target(tgtIceType));
}
