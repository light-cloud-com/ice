/**
 * Predicate behavior tests.
 *
 * Each predicate is a pure regex/equality classifier. Tests cover both
 * the dotted-prefix path (e.g. `Database.PostgreSQL`) and the regex
 * keyword path (e.g. `MyPostgreSQLBlock`) where applicable, plus
 * negative cases. Behavior is byte-identical to the original
 * `connection-rules.ts` predicates and is the basis for every
 * downstream rule match.
 */

import { describe, expect, it } from 'vitest';
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
  isDataWarehouse,
  isVectorDb,
  isLLM,
  isRepo,
  isEnvConfig,
  isDomain,
  isCustomDomain,
  isPrivateNetwork,
  isContainer,
  isService,
  isRoutable,
} from '../predicates';

describe('isDatabase', () => {
  it.each([
    ['Database.PostgreSQL', true],
    ['Compute.PostgreSQL', true],
    ['MyMySQLBlock', true],
    ['gcp.firestore.Anything', true],
    ['Compute.AutonomousDB', true],
    ['Compute.Tablestore', true],
    ['Compute.ManagedDB', true],
    ['Network.VPC', false],
    ['Storage.Bucket', false],
  ])('isDatabase(%s) → %s', (t, expected) => {
    expect(isDatabase(t)).toBe(expected);
  });
});

describe('isCache', () => {
  it.each([
    ['Compute.RedisInstance', true],
    ['MyCacheLayer', true],
    ['MemcacheBox', true],
    ['Database.PostgreSQL', false],
  ])('isCache(%s) → %s', (t, expected) => {
    expect(isCache(t)).toBe(expected);
  });
});

describe('isQueue', () => {
  it.each([
    ['Messaging.Queue', true],
    ['Messaging.SQS', true],
    ['SQSWorker', true],
    ['SNSPublisher', true],
    ['MyPubSubTopic', true],
    ['ServiceBusItem', true],
    ['RabbitMQTask', true],
    ['KafkaCluster', true],
    ['MyEventStream', true],
    ['Storage.Bucket', false],
  ])('isQueue(%s) → %s', (t, expected) => {
    expect(isQueue(t)).toBe(expected);
  });
});

describe('isStorage', () => {
  it.each([
    ['Storage.Bucket', true],
    ['MyS3Backed', true],
    ['GCSBucket', true],
    ['BlobStore', true],
    ['ObjectStorageBox', true],
    ['DigitalOceanSpaces', true],
    ['Database.PostgreSQL', false],
  ])('isStorage(%s) → %s', (t, expected) => {
    expect(isStorage(t)).toBe(expected);
  });
});

describe('isBackend', () => {
  it.each([
    ['Compute.Backend', true],
    ['MyContainerService', true],
    ['BackgroundWorker', true],
    ['CloudFunction', true],
    ['CronJobRunner', true],
    ['ScheduledTask', true],
    ['DigitalOceanAppPlatform', true],
    ['OCIFunctionsBox', true],
    ['Storage.Bucket', false],
    ['Source.Repository', false],
  ])('isBackend(%s) → %s', (t, expected) => {
    expect(isBackend(t)).toBe(expected);
  });
});

describe('isFrontend', () => {
  it.each([
    ['Compute.StaticSite', true],
    ['MySSRSiteBox', true],
    ['MyFrontendApp', true],
    ['Compute.Backend', false],
  ])('isFrontend(%s) → %s', (t, expected) => {
    expect(isFrontend(t)).toBe(expected);
  });
});

describe('isGateway', () => {
  it.each([
    ['Network.Gateway', true],
    ['ApiGateway', true],
    ['MyLoadBalancer', true],
    ['InternetIngress', true],
    ['WAFShield', true],
    ['Compute.Backend', false],
  ])('isGateway(%s) → %s', (t, expected) => {
    expect(isGateway(t)).toBe(expected);
  });
});

describe('isAuth', () => {
  it.each([
    ['Security.Identity', true],
    ['MyAuthService', true],
    ['IdentityProvider', true],
    ['IAMRole', true],
    ['Compute.Backend', false],
  ])('isAuth(%s) → %s', (t, expected) => {
    expect(isAuth(t)).toBe(expected);
  });
});

describe('isSecrets', () => {
  it.each([
    ['Security.Secret', true],
    ['MySecretBox', true],
    ['VaultBackend', true],
    ['SslCertificate', true],
    ['Compute.Backend', false],
  ])('isSecrets(%s) → %s', (t, expected) => {
    expect(isSecrets(t)).toBe(expected);
  });
});

describe('isMonitoring', () => {
  it.each([
    ['Monitoring.Log', true],
    ['Log.Group', true],
    ['MyLogTail', true],
    ['MonitoringDashboard', true],
    ['ObservabilityHub', true],
    ['TerminalReader', true],
    ['Compute.Backend', false],
  ])('isMonitoring(%s) → %s', (t, expected) => {
    expect(isMonitoring(t)).toBe(expected);
  });
});

describe('isSearch / isDataWarehouse / isVectorDb / isLLM', () => {
  it('isSearch covers Analytics.Search + Search/Elasticsearch keywords', () => {
    expect(isSearch('Analytics.Search')).toBe(true);
    expect(isSearch('MyElasticsearchCluster')).toBe(true);
    expect(isSearch('Storage.Bucket')).toBe(false);
  });
  it('isDataWarehouse covers Analytics.DataWarehouse + Warehouse/BigQuery/Redshift/Synapse', () => {
    expect(isDataWarehouse('Analytics.DataWarehouse')).toBe(true);
    expect(isDataWarehouse('MyBigQueryBox')).toBe(true);
    expect(isDataWarehouse('RedshiftWarehouse')).toBe(true);
    expect(isDataWarehouse('SynapseService')).toBe(true);
    expect(isDataWarehouse('Storage.Bucket')).toBe(false);
  });
  it('isVectorDb covers AI.VectorDB + VectorDB/Vector keywords', () => {
    expect(isVectorDb('AI.VectorDB')).toBe(true);
    expect(isVectorDb('MyVectorIndex')).toBe(true);
    expect(isVectorDb('Storage.Bucket')).toBe(false);
  });
  it('isLLM covers AI.LLMGateway / AI.ModelServing + LLM/ModelServing keywords', () => {
    expect(isLLM('AI.LLMGateway')).toBe(true);
    expect(isLLM('AI.ModelServing')).toBe(true);
    expect(isLLM('MyLLMProxy')).toBe(true);
    expect(isLLM('ModelServingPod')).toBe(true);
    expect(isLLM('Storage.Bucket')).toBe(false);
  });
});

describe('isRepo / isEnvConfig', () => {
  it('matches exact iceType and rejects others', () => {
    expect(isRepo('Source.Repository')).toBe(true);
    expect(isRepo('Source.Other')).toBe(false);
    expect(isEnvConfig('Config.Environment')).toBe(true);
    expect(isEnvConfig('Config.Other')).toBe(false);
  });
});

describe('isDomain / isCustomDomain / isPrivateNetwork', () => {
  it('isDomain matches PublicEndpoint, CustomDomain, and Domain/DNS keywords', () => {
    expect(isDomain('Network.PublicEndpoint')).toBe(true);
    expect(isDomain('Network.CustomDomain')).toBe(true);
    expect(isDomain('MyDomainEntry')).toBe(true);
    expect(isDomain('CustomDNSConfig')).toBe(true);
    expect(isDomain('Network.VPC')).toBe(false);
  });
  it('isCustomDomain only matches Network.CustomDomain', () => {
    expect(isCustomDomain('Network.CustomDomain')).toBe(true);
    expect(isCustomDomain('Network.PublicEndpoint')).toBe(false);
  });
  it('isPrivateNetwork only matches Network.PrivateNetwork', () => {
    expect(isPrivateNetwork('Network.PrivateNetwork')).toBe(true);
    expect(isPrivateNetwork('Network.VPC')).toBe(false);
  });
});

describe('isContainer', () => {
  it('treats nodeType="container" or "group" as a container regardless of iceType', () => {
    expect(isContainer('Compute.Backend', 'container')).toBe(true);
    expect(isContainer('Compute.Backend', 'group')).toBe(true);
  });
  it('matches VPC, Subnet, PrivateNetwork iceTypes', () => {
    expect(isContainer('Network.VPC')).toBe(true);
    expect(isContainer('Network.Subnet')).toBe(true);
    expect(isContainer('Network.PrivateNetwork')).toBe(true);
  });
  it('matches any Group.* iceType', () => {
    expect(isContainer('Group.Custom')).toBe(true);
    expect(isContainer('Group.Layer1')).toBe(true);
  });
  it('rejects non-container iceTypes when nodeType is undefined or "block"', () => {
    expect(isContainer('Compute.Backend')).toBe(false);
    expect(isContainer('Compute.Backend', 'block')).toBe(false);
  });
});

describe('isService / isRoutable composites', () => {
  it('isService = backend OR frontend', () => {
    expect(isService('Compute.Backend')).toBe(true);
    expect(isService('Compute.StaticSite')).toBe(true);
    expect(isService('Database.PostgreSQL')).toBe(false);
    expect(isService('Network.Gateway')).toBe(false);
  });
  it('isRoutable = backend OR frontend OR gateway', () => {
    expect(isRoutable('Compute.Backend')).toBe(true);
    expect(isRoutable('Compute.StaticSite')).toBe(true);
    expect(isRoutable('Network.Gateway')).toBe(true);
    expect(isRoutable('ApiGateway')).toBe(true);
    expect(isRoutable('Database.PostgreSQL')).toBe(false);
  });
});
