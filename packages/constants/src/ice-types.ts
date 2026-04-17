/**
 * ICE Resource Tree — pure data, zero logic.
 *
 * TREE is the single source of truth.
 * ICE provides typed path constants.
 * Flat lookup maps are in derived.ts.
 */

const Cat = {
  Compute: 'Compute',
  Data: 'Data',
  Network: 'Network',
  Security: 'Security',
  Observability: 'Observability',
} as const;

export { Cat };
export type NodeCategory = (typeof Cat)[keyof typeof Cat];

export interface ResourceEntry {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly port?: number;
  readonly envVar?: string;
  readonly required?: readonly string[];
}

interface CategoryDef {
  readonly category: NodeCategory;
  readonly resources: Record<string, ResourceEntry>;
}

// ─── The Tree ───────────────────────────────────────────────────────────────

export const TREE = {
  Compute: {
    category: Cat.Compute,
    resources: {
      StaticSite: { id: 'frontend-app' },
      SSRSite: { id: 'ssr-site' },
      Container: { id: 'container-service', aliases: ['BackendAPI'], required: ['size', 'runtime', 'port'] },
      Worker: { id: 'worker', required: ['size', 'runtime'] },
      CronJob: { id: 'scheduled-task', required: ['runtime'] },
      ServerlessFunction: {
        id: 'serverless-function',
        aliases: ['Function'],
        required: ['memory', 'timeout', 'runtime'],
      },
    },
  },
  Database: {
    category: Cat.Data,
    resources: {
      PostgreSQL: { id: 'postgres-db', port: 5432, envVar: 'DATABASE_URL', required: ['size', 'storage', 'version'] },
      MySQL: { id: 'mysql-db', port: 3306, envVar: 'DATABASE_URL', required: ['size', 'storage', 'version'] },
      MongoDB: { id: 'mongodb-db', port: 27017, envVar: 'MONGODB_URI' },
      Redis: { id: 'redis-cache', port: 6379, envVar: 'REDIS_URL', required: ['size'] },
      DynamoDB: { id: 'dynamodb' },
      Firestore: { id: 'firestore' },
      CosmosDB: { id: 'cosmosdb' },
      AutonomousDB: { id: 'autonomous-db' },
      Tablestore: { id: 'tablestore' },
      ManagedDB: { id: 'do-managed-db' },
    },
  },
  Storage: {
    category: Cat.Data,
    resources: {
      Bucket: {
        id: 'object-storage',
        aliases: ['ObjectStorage', 'S3', 'GCS', 'Blob'],
        envVar: 'STORAGE_BUCKET',
        required: ['storage_class'],
      },
      Spaces: { id: 'do-spaces', envVar: 'STORAGE_BUCKET' },
      OSS: { id: 'oss-storage', envVar: 'STORAGE_BUCKET' },
    },
  },
  Messaging: {
    category: Cat.Data,
    resources: {
      SQS: { id: 'sqs', aliases: ['Queue'], envVar: 'SQS_QUEUE_URL', required: ['queue_type'] },
      SNS: { id: 'sns', envVar: 'SNS_TOPIC_ARN' },
      RabbitMQ: { id: 'rabbitmq', port: 5672, envVar: 'AMQP_URL', required: ['size'] },
      CloudPubSub: {
        id: 'cloud-pubsub',
        aliases: ['Kafka', 'EventStream'],
        envVar: 'PUBSUB_TOPIC',
        required: ['keep_messages'],
      },
      ServiceBus: { id: 'service-bus', envVar: 'SERVICE_BUS_CONNECTION' },
      Topic: { id: 'sns' },
      // Concepts Palette — provider-agnostic message queue (compiles per provider)
      Queue: { id: 'message-queue', envVar: 'QUEUE_URL' },
      // Concepts Palette — provider-agnostic pub/sub event stream
      EventStream: { id: 'event-stream', envVar: 'EVENT_STREAM_URL' },
      // Concepts Palette — transactional email service
      Email: { id: 'email-service', envVar: 'EMAIL_SERVICE_URL' },
    },
  },
  Network: {
    category: Cat.Network,
    resources: {
      Gateway: { id: 'api-gateway', required: ['protocol'] },
      // `PublicEndpoint` is the load-balancer entry point for
      // VPC-private services that need to be exposed to the internet.
      // Distinct from `CustomDomain` (which is just DNS routing for
      // services that already have their own public URL).
      PublicEndpoint: { id: 'public-endpoint', aliases: ['LoadBalancer'] },
      // `CustomDomain` carries a root domain + per-edge subdomains and
      // routes to publicly-facing services (Firebase Hosting, AWS
      // Amplify, public Cloud Run, etc.). UI/translator-only — does
      // not compile to a deployable resource.
      CustomDomain: { id: 'custom-domain' },
      // `PrivateNetwork` is a walled VPC container. Children deployed
      // inside land on the synthesized subnet and are reachable only
      // by siblings. A nested Custom Domain (auto-spawned when Open)
      // provides the public ingress via an LB chain.
      PrivateNetwork: { id: 'private-network' },
      VPC: { id: 'vpc-network' },
      Subnet: { id: 'subnet' },
      // Concepts Palette — symbolic source node representing the internet / outside users.
      // Canvas-only (no infrastructure emitted).
      PublicTraffic: { id: 'public-traffic' },
    },
  },
  Security: {
    category: Cat.Security,
    resources: {
      Identity: { id: 'service-account', envVar: 'AUTH_URL' },
      Secret: { id: 'secrets-manager', envVar: 'SECRETS_ARN' },
      WAF: { id: 'waf' },
      Certificate: { id: 'ssl-certificate', aliases: ['SSLCertificate'] },
    },
  },
  Monitoring: {
    category: Cat.Observability,
    resources: {
      Log: { id: 'log-group', required: ['keep_logs'] },
      Terminal: { id: 'log-terminal' },
    },
  },
  AI: {
    category: Cat.Compute,
    resources: {
      VectorDB: { id: 'vector-db', envVar: 'VECTOR_DB_URL' },
      LLMGateway: { id: 'llm-gateway', envVar: 'LLM_API_URL' },
      ModelServing: { id: 'ml-model' },
      // Concepts Palette — self-hosted LLM preset (GPU compute + vector DB + model server).
      PrivateAIService: { id: 'private-ai-service', envVar: 'PRIVATE_AI_URL' },
    },
  },
  Analytics: {
    category: Cat.Data,
    resources: {
      Search: { id: 'search-engine', port: 9200, envVar: 'ELASTICSEARCH_URL' },
      DataWarehouse: { id: 'data-warehouse', envVar: 'DATA_WAREHOUSE_URL' },
    },
  },
  Source: {
    category: Cat.Compute,
    resources: {
      Repository: { id: '', required: ['repository', 'branch'] },
    },
  },
  Config: {
    category: Cat.Compute,
    resources: {
      Environment: { id: '' },
    },
  },
} as const satisfies Record<string, CategoryDef>;

// ─── Typed path constants ───────────────────────────────────────────────────
// ICE.Compute.Container === 'Compute.Container'
// TypeScript enforces every TREE resource has a matching ICE entry.

type IceTypePaths = {
  [K in keyof typeof TREE]: {
    [R in keyof (typeof TREE)[K]['resources']]: `${K & string}.${R & string}`;
  };
};

export const ICE = {
  Compute: {
    StaticSite: 'Compute.StaticSite',
    SSRSite: 'Compute.SSRSite',
    Container: 'Compute.Container',
    Worker: 'Compute.Worker',
    CronJob: 'Compute.CronJob',
    ServerlessFunction: 'Compute.ServerlessFunction',
  },
  Database: {
    PostgreSQL: 'Database.PostgreSQL',
    MySQL: 'Database.MySQL',
    MongoDB: 'Database.MongoDB',
    Redis: 'Database.Redis',
    DynamoDB: 'Database.DynamoDB',
    Firestore: 'Database.Firestore',
    CosmosDB: 'Database.CosmosDB',
    AutonomousDB: 'Database.AutonomousDB',
    Tablestore: 'Database.Tablestore',
    ManagedDB: 'Database.ManagedDB',
  },
  Storage: {
    Bucket: 'Storage.Bucket',
    Spaces: 'Storage.Spaces',
    OSS: 'Storage.OSS',
  },
  Messaging: {
    SQS: 'Messaging.SQS',
    SNS: 'Messaging.SNS',
    RabbitMQ: 'Messaging.RabbitMQ',
    CloudPubSub: 'Messaging.CloudPubSub',
    ServiceBus: 'Messaging.ServiceBus',
    Topic: 'Messaging.Topic',
    Queue: 'Messaging.Queue',
    EventStream: 'Messaging.EventStream',
    Email: 'Messaging.Email',
  },
  Network: {
    Gateway: 'Network.Gateway',
    PublicEndpoint: 'Network.PublicEndpoint',
    CustomDomain: 'Network.CustomDomain',
    PrivateNetwork: 'Network.PrivateNetwork',
    VPC: 'Network.VPC',
    Subnet: 'Network.Subnet',
    PublicTraffic: 'Network.PublicTraffic',
  },
  Security: {
    Identity: 'Security.Identity',
    Secret: 'Security.Secret',
    WAF: 'Security.WAF',
    Certificate: 'Security.Certificate',
  },
  Monitoring: {
    Log: 'Monitoring.Log',
    Terminal: 'Monitoring.Terminal',
  },
  AI: {
    VectorDB: 'AI.VectorDB',
    LLMGateway: 'AI.LLMGateway',
    ModelServing: 'AI.ModelServing',
    PrivateAIService: 'AI.PrivateAIService',
  },
  Analytics: {
    Search: 'Analytics.Search',
    DataWarehouse: 'Analytics.DataWarehouse',
  },
  Source: {
    Repository: 'Source.Repository',
  },
  Config: {
    Environment: 'Config.Environment',
  },
} as const satisfies IceTypePaths;
