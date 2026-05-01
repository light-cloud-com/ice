/**
 * Block-type classification predicates.
 *
 * Each predicate inspects an iceType string (and, for `isContainer`,
 * an optional `nodeType`) and returns whether the type belongs to a
 * logical group (database, cache, queue, ...). The CONNECTION_RULES
 * array composes these predicates into source/target classifiers.
 *
 * Extracted from `connection-rules.ts` in rf-conn-2. The regex bodies
 * are copied byte-identical from the original — adding or removing a
 * single alternation here has shipped behavioral consequences in
 * every caller (canConnect, validateConnection, AI prompt). Touch
 * with care.
 */

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
    /Backend|Container|Worker|Function|CronJob|Scheduled|AppPlatform|OCIFunctions/i.test(t) ||
    t.startsWith('Compute.') ||
    t.startsWith('Compute.')
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

export function isDataWarehouse(t: string): boolean {
  return /Warehouse|BigQuery|Redshift|Synapse/i.test(t) || t === 'Analytics.DataWarehouse';
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
  return t === 'Network.PublicEndpoint' || t === 'Network.CustomDomain' || /Domain|DNS/i.test(t);
}

/**
 * `Network.CustomDomain` is the variant of the domain block that routes
 * DNS to services that already have their own public endpoint (Firebase
 * Hosting, etc.). It's also used NESTED inside a `Network.PrivateNetwork`
 * container to act as that network's public ingress gateway — in the
 * nested case, its routes wire to sibling services inside the parent
 * network's VPC and it compiles to a full LB chain instead of DNS-only.
 *
 * The parent-aware connection check rejects CustomDomain → VPC-internal
 * targets ONLY when the CD is top-level (standalone DNS can't penetrate
 * a VPC). Nested CDs inside a PrivateNetwork can target their siblings
 * because the compiler will synthesize the LB.
 */
export function isCustomDomain(t: string): boolean {
  return t === 'Network.CustomDomain';
}

/**
 * `Network.PrivateNetwork` is a pure container block. Children nest
 * inside via parentId. It has NO ports — all routing goes through a
 * nested `Network.CustomDomain` child when the user wants public
 * ingress.
 */
export function isPrivateNetwork(t: string): boolean {
  return t === 'Network.PrivateNetwork';
}

export function isContainer(iceType: string, nodeType?: string): boolean {
  if (nodeType === 'container' || nodeType === 'group') return true;
  return (
    iceType === 'Network.VPC' ||
    iceType === 'Network.Subnet' ||
    iceType === 'Network.PrivateNetwork' ||
    iceType.startsWith('Group.')
  );
}

// ─── Composite predicates (internal building blocks) ────────────────────────

/** Composite: anything deployable (backend + frontend) */
export function isService(t: string): boolean {
  return isBackend(t) || isFrontend(t);
}

/** Composite: anything that can receive DNS traffic */
export function isRoutable(t: string): boolean {
  return isBackend(t) || isFrontend(t) || isGateway(t);
}
