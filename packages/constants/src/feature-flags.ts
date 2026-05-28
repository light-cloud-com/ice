/**
 * Feature Flags
 *
 * Per-provider toggles and per-(category × provider) overrides that gate
 * UI surfaces: palette, wizard, onboarding, app bar, settings, canvas
 * menus, template badges, status dots, deploy validation.
 *
 * Each provider has a top-level `enabled` toggle and an exhaustive
 * per-category map. To gate a (provider, category) combo, flip its
 * boolean. Top-level `enabled: false` short-circuits everything — the
 * category map for that provider is ignored.
 *
 * The category list is the user-facing palette partition (see
 * `categories.ts`, `CATEGORY_IDS`). An integrity test asserts every
 * provider's `categories` map covers every CategoryId.
 */

import { getCategoryForIceType, type CategoryId } from './categories';
import { ALL_PROVIDERS, CLOUD_PROVIDERS, type CloudProviderMeta, type Provider } from './providers';

export interface ProviderFlags {
  enabled: boolean;
  categories: Record<CategoryId, boolean>;
}

export const PROVIDER_FLAGS: Record<Provider, ProviderFlags> = {
  // AWS — full category rollout. Every block listed in
  // packages/core/src/deploy/providers/aws/README.md now has:
  //   - a handler (`HANDLER_REGISTRY` entry in aws-deployer.ts)
  //   - an extractor (`PROPERTY_EXTRACTORS` entry in dispatch.ts)
  //   - a mocked-SDK test
  //   - a developer-runnable live test (`pnpm test:live:aws <service>`)
  //   - the canvas-wired update path for CloudFront / Cognito / DocDB /
  //     Redshift / EC2 ModifyVolume
  // SDK class refs and input-field names are statically verified
  // against the real npm SDK packages by `pnpm verify:sdk:all`.
  //
  // Per-handler real-cloud deploy gates remain a developer responsibility
  // (the cardinal rule). Flipping the UI flags exposes the handlers in
  // the palette / plan modal; operators should still smoke-test each
  // category against their own account before treating production
  // deploys as supported.
  aws: {
    enabled: true,
    categories: {
      Compute: true, // ECS service/worker, Lambda (with CodeBuild fallback), EC2 instance
      Scheduler: true, // EventBridge rule (schedule_expression branch)
      Frontend: true, // CloudFront (canvas-wired ACM cert), Amplify Hosting
      Network: true, // VPC, Subnet, SecurityGroup, ELBv2, Route53, VPC Endpoint
      Database: true, // RDS, DynamoDB, ElastiCache, DocDB, Redshift
      Cache: true, // ElastiCache (Redis + Memcached)
      Messaging: true, // SQS, SNS, EventBridge, Amazon MQ, Kinesis
      Storage: true, // S3 (account-id suffix)
      Security: true, // ACM, Cognito user pool, Secrets Manager, WAFv2
      AI: true, // Bedrock, SageMaker, OpenSearch Serverless (vector)
      Analytics: true, // OpenSearch, Redshift, Timestream
      Monitoring: true, // CloudWatch Logs, CloudWatch Alarm
      Source: true, // CodeBuild
      Config: true, // provider-agnostic
    },
  },
  gcp: {
    enabled: true,
    categories: {
      Compute: true, // Cloud Run service/job, Cloud Functions, GKE, Compute Instance
      Scheduler: true, // Cloud Scheduler
      Frontend: true, // Firebase Hosting, Backend Bucket, Cloud CDN
      Network: true, // VPC, Subnet, LB, Cloud DNS, Firewall, PSC
      Database: true, // Cloud SQL, Firestore, Memorystore
      Cache: true, // Memorystore Redis
      Messaging: true, // Pub/Sub, Dataflow
      Storage: true, // Cloud Storage
      Security: true, // Secret Manager, Identity Platform, Cloud Armor, Managed SSL
      AI: true, // Vertex AI, Discovery Engine
      Analytics: true, // BigQuery, Dataflow
      Monitoring: true, // Cloud Logging, Cloud Monitoring (alerts)
      Source: true, // Cloud Build
      Config: true, // provider-agnostic
    },
  },
  // Azure — full category rollout. 38 handlers across every category
  // (see packages/core/src/deploy/providers/azure/README.md). Same
  // verification gates as AWS: mocked tests, live tests under
  // packages/core/src/deploy/providers/__tests__/live/azure-*.live.test.ts,
  // and `pnpm verify:sdk:all` for SDK input-field correctness.
  azure: {
    enabled: true,
    categories: {
      Compute: true, // VM, Web App, Functions, Container Apps, Static Web Apps, AKS, ACR
      Scheduler: true, // Logic Apps (recurrence trigger)
      Frontend: true, // Static Web Apps, Front Door, DNS Zone
      Network: true, // VNet, Subnet, NSG, Private Endpoint, App Gateway, Front Door, APIM, WAF
      Database: true, // PostgreSQL Flex, MySQL Flex, Cosmos DB, Redis Cache, SQL Server
      Cache: true, // Cache for Redis
      Messaging: true, // Service Bus, Event Hubs, Event Grid, Logic Apps
      Storage: true, // Blob Storage (Storage Account)
      Security: true, // Key Vault, Entra B2C, WAF policy
      AI: true, // Azure OpenAI, Azure ML, Cognitive Search (vector)
      Analytics: true, // Synapse, Data Explorer (Kusto), Cognitive Search
      Monitoring: true, // Log Analytics, App Insights
      Source: true, // ACR Tasks
      Config: true, // provider-agnostic
    },
  },
  // Kubernetes — 17 handlers (Compute/Network/Database/Cache/Messaging/
  // Storage/Security/Monitoring/Config). AI + Analytics + Source held
  // off (KServe / Argo Workflows handlers not yet implemented). All
  // handlers have mocked-SDK tests + L4 SDK input-field verification;
  // operator runs `pnpm test:live:kubernetes` for the deploy gate.
  kubernetes: {
    enabled: true,
    categories: {
      Compute: true, // Deployment, StatefulSet, CronJob, Job, HPA, Knative Service (CRD)
      Scheduler: true, // CronJob (schedule_expression branch)
      Frontend: true, // Ingress (Network.CustomDomain default class nginx)
      Network: true, // Namespace, Service, NetworkPolicy, Ingress
      Database: true, // StatefulSet profile per DB engine
      Cache: true, // StatefulSet (redis profile)
      Messaging: true, // StatefulSet (rabbitmq / kafka profiles)
      Storage: true, // PersistentVolumeClaim
      Security: true, // Secret, ServiceAccount, cert-manager Certificate (CRD)
      AI: false, // KServe InferenceService — design-only
      Analytics: false, // no first-party K8s analog
      Monitoring: true, // PrometheusRule (CRD), PodDisruptionBudget
      Source: false, // Argo Workflows — design-only
      Config: true, // ConfigMap
    },
  },
  // Alibaba Cloud — 32 handlers across every category. Mocked-SDK tests
  // green, L4 verifier covers 66/74 invocations (8 unverified are
  // pure-JS @alicloud/mns + absent @alicloud/amqp-open SDKs). Live
  // tests skip-with-banner until operator sets
  // ALIBABA_CLOUD_ACCESS_KEY_ID + SECRET + REGION.
  //
  // NOTE: flipping ahead of real-cloud deploy gate — operator is
  // verifying through their own account. Update the rollout-state
  // matrix in providers/alibaba/README.md as each category lands.
  alibaba: {
    enabled: true,
    categories: {
      Compute: true, // ecs.instance, sae.application, fc.function, eci.containerGroup
      Scheduler: true, // eventbridge.rule
      Frontend: true, // cdn.domain
      Network: true, // vpc.vpc, vpc.vSwitch, ecs.securityGroup, slb.loadBalancer, alidns.domainRecord, privatelink.endpoint, apigateway.api
      Database: true, // rds.dbInstance, dds.dbInstance, kvstore.instance
      Cache: true, // kvstore.instance (Redis)
      Messaging: true, // mns.queue, mns.topic, amqp.instance
      Storage: true, // oss.bucket
      Security: true, // kms.secret, ram.user, cas.certificate, waf.policy
      AI: true, // paieas.service, pai.workspace
      Analytics: true, // maxcompute.project, opensearch.app
      Monitoring: true, // sls.project
      Source: true, // cr.buildTask (Container Image Build)
      Config: true, // provider-agnostic
    },
  },
  // OCI — 31 handlers across every category. 80/80 L4 verified. Live
  // tests skip-with-banner until operator sets OCI_COMPARTMENT_ID +
  // OCI_REGION + ~/.oci/config (or instance-principal auth).
  //
  // NOTE: flipping ahead of real-cloud deploy gate; same caveat as
  // Alibaba. Source = false because no CodeBuild-equivalent ships;
  // operators wire artifacts.repository + external build.
  oci: {
    enabled: true,
    categories: {
      Compute: true, // core.instance, containerinstance.instance, functions.function, resourcescheduler.schedule
      Scheduler: true, // resourcescheduler.schedule
      Frontend: true, // objectstorage.bucket (static site front), apigateway.gateway
      Network: true, // core.vcn, core.subnet, core.networksecuritygroup, loadbalancer.loadbalancer, dns.zone, apigateway.gateway, core.privateaccessgateway
      Database: true, // psql.dbsystem, mysql.dbsystem, database.autonomousdatabase, nosql.table, redis.cluster
      Cache: true, // redis.cluster
      Messaging: true, // queue.queue, streaming.stream, ons.topic
      Storage: true, // objectstorage.bucket
      Security: true, // vault.secret, identitydomains.user, certificates.certificate, waf.policy
      AI: true, // generativeai.endpoint, datascience.modeldeployment
      Analytics: true, // analytics.instance
      Monitoring: true, // logging.loggroup, monitoring.alarm
      Source: false, // no first-party CodeBuild equivalent
      Config: true, // provider-agnostic
    },
  },
  // DigitalOcean — 18 handlers. dots-wrapper 3.x lacks Functions
  // namespace + monitoring.alertPolicy (stubbed handlers point at
  // doctl serverless + DO REST). 37/41 L4 verified. Live tests
  // skip-with-banner until DIGITALOCEAN_TOKEN + REGION set.
  //
  // NOTE: flipping ahead of real-cloud deploy gate. Scheduler =
  // false because DO has no first-party scheduler service (cron
  // happens inside App Platform). Analytics / AI = false (no
  // first-party services). Source = false (no CodeBuild-equivalent).
  digitalocean: {
    enabled: true,
    categories: {
      Compute: true, // droplet.instance, apps.app, kubernetes.cluster, containerregistry.registry, apps.staticSite, functions.* (stub)
      Scheduler: false, // no first-party scheduler
      Frontend: true, // apps.staticSite
      Network: true, // loadbalancer, vpc.network, domain.record, firewall, reservedip
      Database: true, // databases.cluster (postgres / mysql / mongodb)
      Cache: true, // databases.cluster (redis engine)
      Messaging: false, // no first-party messaging service
      Storage: true, // spaces.bucket (S3-compatible), volume.volume, droplet.snapshot
      Security: true, // apps.envvar (App Platform secrets)
      AI: false, // no first-party
      Analytics: false, // no first-party
      Monitoring: true, // monitoring.alertpolicy (stub, REST direct)
      Source: false, // no CodeBuild-equivalent
      Config: true, // provider-agnostic
    },
  },
  // IBM Cloud — 27 handlers (12 first-class + 15 via Resource
  // Controller factory). 31/31 L4 verified. Live tests skip-with-banner
  // until IBMCLOUD_API_KEY + REGION + RESOURCE_GROUP_ID set.
  //
  // NOTE: flipping ahead of real-cloud deploy gate. Analytics / Source
  // / Frontend = false because no first-party Node SDKs published for
  // those service families; operators bring REST-direct integration.
  ibm: {
    enabled: true,
    categories: {
      Compute: true, // codeengine.application, codeengine.function, codeengine.job, vpc.instance
      Scheduler: true, // codeengine.job (cron / array variant)
      Frontend: false, // no first-party static-site service (use codeengine.application)
      Network: true, // vpc.vpc, vpc.subnet, vpc.securitygroup, vpc.loadbalancer, cis.zone, cis.wafrule
      Database: true, // databases.postgresql, .mysql, .mongodb, .redis
      Cache: true, // databases.redis
      Messaging: true, // cloudant.database, eventstreams.topic, mq.queuemanager, eventnotifications.instance
      Storage: true, // cos.bucket
      Security: true, // secretsmanager.secret, secretsmanager.importedcert, appid.instance
      AI: true, // watsonx.deployment
      Analytics: false, // no first-party (use cloudant + COS + operator-driven ETL)
      Monitoring: true, // logging.instance (Activity Tracker), monitoring.alert (Sysdig)
      Source: false, // no first-party CodeBuild-equivalent
      Config: true, // provider-agnostic
    },
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

export function isProviderEnabled(p: Provider | string): boolean {
  return PROVIDER_FLAGS[p as Provider]?.enabled === true;
}

export function isCategoryEnabledForProvider(category: CategoryId, p: Provider | string): boolean {
  const cfg = PROVIDER_FLAGS[p as Provider];
  return cfg?.enabled === true && cfg.categories[category] === true;
}

/**
 * Resolve (iceType, provider) → enabled.
 *
 * Returns `true` if the provider is on AND the iceType's category is on.
 * iceTypes that don't map to any CategoryId (unknown shape) are treated
 * as ungated — only the provider-level flag applies.
 */
export function isIceTypeEnabledForProvider(iceType: string, p: Provider | string): boolean {
  if (!isProviderEnabled(p)) return false;
  const category = getCategoryForIceType(iceType);
  if (!category) return true;
  return isCategoryEnabledForProvider(category, p);
}

export function getEnabledProvidersForCategory(category: CategoryId): Provider[] {
  return ALL_PROVIDERS.filter((p) => isCategoryEnabledForProvider(category, p));
}

// ── Derived lists used by the UI ───────────────────────────────────────────

export const ENABLED_PROVIDER_IDS: ReadonlySet<string> = new Set<string>(ALL_PROVIDERS.filter(isProviderEnabled));

export const ENABLED_PROVIDERS: CloudProviderMeta[] = CLOUD_PROVIDERS.filter((p) => isProviderEnabled(p.id));
