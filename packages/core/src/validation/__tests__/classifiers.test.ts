/**
 * Classifier Predicate Tests
 *
 * Exercises every isX() predicate plus the canConnect() rule matrix.
 * Mirrors the expectations on @ice/types/connection-rules/predicates.ts —
 * if these diverge, that's the signal flagged in decisions.md (rf-0c).
 */

import { describe, it, expect } from 'vitest';
import {
  isDatabase,
  isCache,
  isQueue,
  isStorage,
  isBackend,
  isFrontend,
  isGateway,
  isAuth,
  isSecrets,
  isMonitoring,
  isSearch,
  isVectorDb,
  isLLM,
  isRepo,
  isEnvConfig,
  isDomain,
  isContainer,
  canConnect,
} from '../classifiers.js';

describe('isDatabase', () => {
  it('matches the Database. prefix', () => {
    expect(isDatabase('Database.PostgreSQL')).toBe(true);
    expect(isDatabase('Database.MongoDB')).toBe(true);
  });

  it('matches engine name fragments anywhere in the type', () => {
    expect(isDatabase('Storage.PostgreSQL')).toBe(true);
    expect(isDatabase('Custom.MySQLBox')).toBe(true);
    expect(isDatabase('AWS.DynamoDB')).toBe(true);
    expect(isDatabase('GCP.Firestore')).toBe(true);
    expect(isDatabase('Azure.CosmosDB')).toBe(true);
    expect(isDatabase('Oracle.AutonomousDB')).toBe(true);
    expect(isDatabase('Alibaba.Tablestore')).toBe(true);
    expect(isDatabase('DO.ManagedDB')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isDatabase('Compute.Container')).toBe(false);
    expect(isDatabase('')).toBe(false);
  });
});

describe('isCache', () => {
  it('matches Redis / Cache / Memcache fragments', () => {
    expect(isCache('Database.Redis')).toBe(true);
    expect(isCache('Storage.MemcacheCluster')).toBe(true);
    expect(isCache('Cache.MyOwn')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isCache('Database.PostgreSQL')).toBe(false);
  });
});

describe('isQueue', () => {
  it('matches the Messaging. prefix', () => {
    expect(isQueue('Messaging.Queue')).toBe(true);
    expect(isQueue('Messaging.SQS')).toBe(true);
  });

  it('matches messaging engine fragments', () => {
    expect(isQueue('AWS.SQS')).toBe(true);
    expect(isQueue('AWS.SNS')).toBe(true);
    expect(isQueue('GCP.PubSub')).toBe(true);
    expect(isQueue('Azure.ServiceBus')).toBe(true);
    expect(isQueue('Custom.RabbitMQ')).toBe(true);
    expect(isQueue('Custom.KafkaCluster')).toBe(true);
    expect(isQueue('AWS.EventBridge')).toBe(true);
  });

  it('returns false for non-messaging types', () => {
    expect(isQueue('Compute.Container')).toBe(false);
  });
});

describe('isStorage', () => {
  it('matches the Storage. prefix', () => {
    expect(isStorage('Storage.Bucket')).toBe(true);
  });

  it('matches storage engine fragments', () => {
    expect(isStorage('AWS.S3')).toBe(true);
    expect(isStorage('GCP.GCS')).toBe(true);
    expect(isStorage('Azure.Blob')).toBe(true);
    expect(isStorage('Oracle.ObjectStorage')).toBe(true);
    expect(isStorage('DO.Spaces')).toBe(true);
  });

  it('returns false for non-storage types', () => {
    expect(isStorage('Database.PostgreSQL')).toBe(false);
  });
});

describe('isBackend', () => {
  it('matches the Compute. prefix', () => {
    expect(isBackend('Compute.Container')).toBe(true);
    expect(isBackend('Compute.BackendAPI')).toBe(true);
  });

  it('matches compute keywords', () => {
    expect(isBackend('Custom.Backend')).toBe(true);
    expect(isBackend('Custom.Container')).toBe(true);
    expect(isBackend('Custom.Worker')).toBe(true);
    expect(isBackend('Custom.Function')).toBe(true);
    expect(isBackend('Custom.CronJob')).toBe(true);
    expect(isBackend('Custom.ScheduledTask')).toBe(true);
    expect(isBackend('DO.AppPlatform')).toBe(true);
    expect(isBackend('Oracle.OCIFunctions')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isBackend('Storage.Bucket')).toBe(false);
    expect(isBackend('')).toBe(false);
  });
});

describe('isFrontend', () => {
  it('matches static / SSR / generic frontend fragments', () => {
    expect(isFrontend('Compute.StaticSite')).toBe(true);
    expect(isFrontend('Compute.SSRSite')).toBe(true);
    expect(isFrontend('Custom.Frontend')).toBe(true);
  });

  it('returns false for non-frontend types', () => {
    expect(isFrontend('Compute.Container')).toBe(false);
  });
});

describe('isGateway', () => {
  it('matches gateway / load balancer / WAF / Internet keywords', () => {
    expect(isGateway('Network.Gateway')).toBe(true);
    expect(isGateway('AWS.LoadBalancer')).toBe(true);
    expect(isGateway('AWS.InternetGateway')).toBe(true);
    expect(isGateway('Security.WAF')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isGateway('Storage.Bucket')).toBe(false);
  });
});

describe('isAuth', () => {
  it('matches Auth / Identity / IAM fragments', () => {
    expect(isAuth('Security.Auth')).toBe(true);
    expect(isAuth('AWS.Cognito')).toBe(false); // does not contain Auth/Identity/IAM
    expect(isAuth('AWS.IAM')).toBe(true);
    expect(isAuth('Security.Identity')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isAuth('Compute.Container')).toBe(false);
  });
});

describe('isSecrets', () => {
  it('matches Secret / Vault / Certificate fragments', () => {
    expect(isSecrets('Security.Secret')).toBe(true);
    expect(isSecrets('AWS.SecretsManager')).toBe(true);
    expect(isSecrets('HashiCorp.Vault')).toBe(true);
    expect(isSecrets('AWS.Certificate')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isSecrets('Compute.Container')).toBe(false);
  });
});

describe('isMonitoring', () => {
  it('matches Monitoring./Log. prefixes', () => {
    expect(isMonitoring('Monitoring.Log')).toBe(true);
    expect(isMonitoring('Log.Stream')).toBe(true);
  });

  it('matches log/monitor/observability/terminal fragments', () => {
    expect(isMonitoring('AWS.CloudWatchLog')).toBe(true);
    expect(isMonitoring('Custom.Monitor')).toBe(true);
    expect(isMonitoring('NewRelic.Observability')).toBe(true);
    expect(isMonitoring('Custom.Terminal')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isMonitoring('Database.PostgreSQL')).toBe(false);
  });
});

describe('isSearch', () => {
  it('matches the Search literal and Elasticsearch keyword', () => {
    expect(isSearch('Analytics.Search')).toBe(true);
    expect(isSearch('AWS.Elasticsearch')).toBe(true);
    expect(isSearch('Custom.SearchService')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isSearch('Database.PostgreSQL')).toBe(false);
  });
});

describe('isVectorDb', () => {
  it('matches AI.VectorDB and Vector keyword', () => {
    expect(isVectorDb('AI.VectorDB')).toBe(true);
    expect(isVectorDb('Custom.VectorService')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isVectorDb('Database.PostgreSQL')).toBe(false);
  });
});

describe('isLLM', () => {
  it('matches LLM and ModelServing fragments and the literal AI types', () => {
    expect(isLLM('AI.LLMGateway')).toBe(true);
    expect(isLLM('AI.ModelServing')).toBe(true);
    expect(isLLM('Custom.LLM')).toBe(true);
    expect(isLLM('Custom.ModelServing')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isLLM('Database.PostgreSQL')).toBe(false);
  });
});

describe('isRepo', () => {
  it('matches only Source.Repository exactly', () => {
    expect(isRepo('Source.Repository')).toBe(true);
    expect(isRepo('Source.Other')).toBe(false);
    expect(isRepo('Repository')).toBe(false);
  });
});

describe('isEnvConfig', () => {
  it('matches only Config.Environment exactly', () => {
    expect(isEnvConfig('Config.Environment')).toBe(true);
    expect(isEnvConfig('Config.Other')).toBe(false);
  });
});

describe('isDomain', () => {
  it('matches the Network.PublicEndpoint literal', () => {
    expect(isDomain('Network.PublicEndpoint')).toBe(true);
  });

  it('matches Domain / DNS keywords', () => {
    expect(isDomain('Network.CustomDomain')).toBe(true);
    expect(isDomain('AWS.Route53DNS')).toBe(true);
  });

  it('returns false for unrelated types', () => {
    expect(isDomain('Compute.Container')).toBe(false);
  });
});

describe('isContainer', () => {
  it('treats container/group nodeType as a container regardless of iceType', () => {
    expect(isContainer('Compute.Container', 'container')).toBe(true);
    expect(isContainer('Compute.Container', 'group')).toBe(true);
  });

  it('returns true for Network.* container types from NETWORK_CONTAINER_TYPES', () => {
    expect(isContainer('Network.VPC')).toBe(true);
    expect(isContainer('Network.Subnet')).toBe(true);
    expect(isContainer('Network.PrivateNetwork')).toBe(true);
  });

  it('returns true for any Group.* iceType', () => {
    expect(isContainer('Group.Backend')).toBe(true);
  });

  it('returns false for normal resource types', () => {
    expect(isContainer('Database.PostgreSQL')).toBe(false);
    expect(isContainer('Compute.Container', 'resource')).toBe(false);
  });
});

describe('canConnect — request traffic', () => {
  it('allows Frontend → Backend', () => {
    expect(canConnect('Compute.StaticSite', 'Compute.Container')).toBe(true);
  });

  it('allows Gateway → Gateway / Backend / Frontend', () => {
    expect(canConnect('Network.Gateway', 'Network.Gateway')).toBe(true);
    expect(canConnect('Network.Gateway', 'Compute.Container')).toBe(true);
    expect(canConnect('Network.Gateway', 'Compute.StaticSite')).toBe(true);
  });

  it('allows Backend → Backend / Auth', () => {
    expect(canConnect('Compute.Container', 'Compute.Container')).toBe(true);
    expect(canConnect('Compute.Container', 'Security.Identity')).toBe(true);
  });

  it('allows Frontend → Auth / Gateway', () => {
    expect(canConnect('Compute.StaticSite', 'Security.Identity')).toBe(true);
    expect(canConnect('Compute.StaticSite', 'Network.Gateway')).toBe(true);
  });
});

describe('canConnect — data traffic', () => {
  it('allows Backend → DB / Cache / Storage / Search / VectorDB / LLM', () => {
    expect(canConnect('Compute.Container', 'Database.PostgreSQL')).toBe(true);
    expect(canConnect('Compute.Container', 'Database.Redis')).toBe(true);
    expect(canConnect('Compute.Container', 'Storage.Bucket')).toBe(true);
    expect(canConnect('Compute.Container', 'Analytics.Search')).toBe(true);
    expect(canConnect('Compute.Container', 'AI.VectorDB')).toBe(true);
    expect(canConnect('Compute.Container', 'AI.LLMGateway')).toBe(true);
  });

  it('allows Frontend → Storage', () => {
    expect(canConnect('Compute.StaticSite', 'Storage.Bucket')).toBe(true);
  });

  it('allows reverse data edges back to Backend', () => {
    expect(canConnect('Database.PostgreSQL', 'Compute.Container')).toBe(true);
    expect(canConnect('Database.Redis', 'Compute.Container')).toBe(true);
    expect(canConnect('Storage.Bucket', 'Compute.Container')).toBe(true);
    expect(canConnect('Storage.Bucket', 'Compute.StaticSite')).toBe(true);
    expect(canConnect('Analytics.Search', 'Compute.Container')).toBe(true);
    expect(canConnect('AI.VectorDB', 'Compute.Container')).toBe(true);
    expect(canConnect('AI.LLMGateway', 'Compute.Container')).toBe(true);
    expect(canConnect('Security.Identity', 'Compute.Container')).toBe(true);
    expect(canConnect('Security.Identity', 'Compute.StaticSite')).toBe(true);
  });
});

describe('canConnect — pub/sub and warehouse', () => {
  it('allows Backend ↔ Queue', () => {
    expect(canConnect('Compute.Container', 'Messaging.Queue')).toBe(true);
    expect(canConnect('Messaging.Queue', 'Compute.Container')).toBe(true);
  });

  it('allows Backend ↔ DataWarehouse via the warehouse predicate', () => {
    expect(canConnect('Compute.Container', 'Analytics.DataWarehouse')).toBe(true);
    expect(canConnect('Analytics.DataWarehouse', 'Compute.Container')).toBe(true);
    expect(canConnect('Compute.Container', 'AWS.Redshift')).toBe(true);
    expect(canConnect('GCP.BigQuery', 'Compute.Container')).toBe(true);
    expect(canConnect('Azure.Synapse', 'Compute.Container')).toBe(true);
  });
});

describe('canConnect — monitoring', () => {
  it('lets any non-monitoring, non-container type stream into a monitor', () => {
    expect(canConnect('Database.PostgreSQL', 'Monitoring.Log')).toBe(true);
    expect(canConnect('Compute.Container', 'Monitoring.Log')).toBe(true);
  });

  it('does not allow monitoring → monitoring (source predicate excludes monitoring)', () => {
    expect(canConnect('Monitoring.Log', 'Monitoring.Log')).toBe(false);
  });
});

describe('canConnect — pipeline & config & DNS', () => {
  it('allows Repo ↔ Service', () => {
    expect(canConnect('Source.Repository', 'Compute.Container')).toBe(true);
    expect(canConnect('Compute.StaticSite', 'Source.Repository')).toBe(true);
  });

  it('allows Service ↔ EnvConfig and Service ↔ Secrets', () => {
    expect(canConnect('Compute.Container', 'Config.Environment')).toBe(true);
    expect(canConnect('Config.Environment', 'Compute.Container')).toBe(true);
    expect(canConnect('Compute.Container', 'Security.Secret')).toBe(true);
    expect(canConnect('Security.Secret', 'Compute.Container')).toBe(true);
  });

  it('allows Domain ↔ Backend / Frontend / Gateway', () => {
    expect(canConnect('Network.PublicEndpoint', 'Compute.Container')).toBe(true);
    expect(canConnect('Network.PublicEndpoint', 'Compute.StaticSite')).toBe(true);
    expect(canConnect('Network.PublicEndpoint', 'Network.Gateway')).toBe(true);
    expect(canConnect('Compute.Container', 'Network.PublicEndpoint')).toBe(true);
  });
});

describe('canConnect — rejections', () => {
  it('blocks any connection involving a container endpoint', () => {
    expect(canConnect('Network.VPC', 'Compute.Container')).toBe(false);
    expect(canConnect('Compute.Container', 'Network.VPC')).toBe(false);
    expect(canConnect('Compute.Container', 'Group.Backend')).toBe(false);
    expect(canConnect('Compute.Container', 'Compute.Container', undefined, 'container')).toBe(false);
  });

  it('blocks pairs not in the rule list', () => {
    expect(canConnect('Database.PostgreSQL', 'Database.PostgreSQL')).toBe(false);
    expect(canConnect('Storage.Bucket', 'Database.PostgreSQL')).toBe(false);
    expect(canConnect('Messaging.Queue', 'Messaging.Queue')).toBe(false);
  });

  it('treats Compute.* as Backend (startsWith Compute.) so Frontend→Frontend resolves through the Backend→Backend rule', () => {
    // This is a side effect of isBackend's `t.startsWith('Compute.')` clause —
    // every Compute.* type is also a backend, so two static sites are allowed
    // to be wired together by the Backend→Backend rule. Documenting it here so
    // the matrix is auditable.
    expect(canConnect('Compute.StaticSite', 'Compute.StaticSite')).toBe(true);
  });
});
