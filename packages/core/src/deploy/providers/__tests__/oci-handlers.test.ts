/**
 * Smoke tests for OCI P0 handlers — dispatch verification with stubbed
 * service clients.
 */

import { describe, expect, it, vi } from 'vitest';
import { OCIDeployer } from '../oci/oci-deployer';

function deployer_with(
  stubs: Record<string, unknown>,
  extras: Partial<{ objectstorage_namespace: string }> = {},
): OCIDeployer {
  const deployer = new OCIDeployer();
  const clients = new Map<string, unknown>();
  for (const [service, client] of Object.entries(stubs)) {
    clients.set(service, { resolve: async () => client });
  }
  (deployer as unknown as { ctx: any }).ctx = {
    region: 'us-ashburn-1',
    compartment_id: 'ocid1.compartment.oc1..test',
    credentials: { compartment_id: 'ocid1.compartment.oc1..test', region: 'us-ashburn-1' },
    clients,
    ...extras,
  };
  return deployer;
}

describe('OCI P0 handler dispatch', () => {
  it('routes core.instance create through Compute launchInstance', async () => {
    const launchInstance = vi.fn().mockResolvedValue({ instance: { id: 'ocid1.instance.oc1..x' } });
    const deployer = deployer_with({ core: { launchInstance } });
    const result = await deployer.create('oci.core.instance', 'web', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.instance.oc1..x');
  });

  it('routes core.vcn create through VirtualNetwork createVcn', async () => {
    const createVcn = vi.fn().mockResolvedValue({ vcn: { id: 'ocid1.vcn.oc1..x' } });
    const deployer = deployer_with({ vnclient: { createVcn } });
    const result = await deployer.create('oci.core.vcn', 'main', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.vcn.oc1..x');
  });

  it('routes core.subnet create through createSubnet', async () => {
    const createSubnet = vi.fn().mockResolvedValue({ subnet: { id: 'ocid1.subnet.oc1..x' } });
    const deployer = deployer_with({ vnclient: { createSubnet } });
    const result = await deployer.create('oci.core.subnet', 's', { vcn_id: 'ocid1.vcn.oc1..y' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.subnet.oc1..x');
  });

  it('routes core.networksecuritygroup create through createNetworkSecurityGroup', async () => {
    const createNetworkSecurityGroup = vi.fn().mockResolvedValue({ networkSecurityGroup: { id: 'ocid1.nsg.oc1..x' } });
    const deployer = deployer_with({ vnclient: { createNetworkSecurityGroup } });
    const result = await deployer.create('oci.core.networksecuritygroup', 'sg', { vcn_id: 'ocid1.vcn.oc1..y' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.nsg.oc1..x');
  });

  it('routes objectstorage.bucket create through createBucket', async () => {
    const createBucket = vi.fn().mockResolvedValue({});
    const deployer = deployer_with({ objectstorage: { createBucket } }, { objectstorage_namespace: 'tenancy' });
    const result = await deployer.create('oci.objectstorage.bucket', 'data', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('tenancy/data');
  });

  it('routes database.autonomousdatabase create through createAutonomousDatabase', async () => {
    const createAutonomousDatabase = vi.fn().mockResolvedValue({ autonomousDatabase: { id: 'ocid1.adb.oc1..x' } });
    const deployer = deployer_with({ database: { createAutonomousDatabase } });
    const result = await deployer.create(
      'oci.database.autonomousdatabase',
      'app-db',
      { admin_password: 'Aa1#Strong_pass' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.adb.oc1..x');
  });

  it('rejects autonomousdatabase with weak password', async () => {
    const deployer = deployer_with({ database: { createAutonomousDatabase: vi.fn() } });
    const result = await deployer.create('oci.database.autonomousdatabase', 'app-db', { admin_password: 'weak' }, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Admin password/);
  });

  it('routes mysql.dbsystem create through createDbSystem', async () => {
    const createDbSystem = vi.fn().mockResolvedValue({ dbSystem: { id: 'ocid1.mysqldbsystem.oc1..x' } });
    const deployer = deployer_with({ mysql: { createDbSystem } });
    const result = await deployer.create('oci.mysql.dbsystem', 'app-db', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.mysqldbsystem.oc1..x');
  });

  it('routes psql.dbsystem create through createDbSystem', async () => {
    const createDbSystem = vi.fn().mockResolvedValue({ dbSystem: { id: 'ocid1.psqldbsystem.oc1..x' } });
    const deployer = deployer_with({ psql: { createDbSystem } });
    const result = await deployer.create('oci.psql.dbsystem', 'pg', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.psqldbsystem.oc1..x');
  });

  it('routes nosql.table create through createTable', async () => {
    const createTable = vi.fn().mockResolvedValue({ table: { id: 'ocid1.nosqltable.oc1..x' } });
    const deployer = deployer_with({ nosql: { createTable } });
    const result = await deployer.create('oci.nosql.table', 't', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.nosqltable.oc1..x');
  });

  it('routes redis.cluster create through createRedisCluster', async () => {
    const createRedisCluster = vi.fn().mockResolvedValue({ redisCluster: { id: 'ocid1.redis.oc1..x' } });
    const deployer = deployer_with({ redis: { createRedisCluster } });
    const result = await deployer.create('oci.redis.cluster', 'cache', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.redis.oc1..x');
  });

  it('routes functions.function create through createFunction', async () => {
    const createFunction = vi.fn().mockResolvedValue({ function: { id: 'ocid1.fnfunc.oc1..x' } });
    const deployer = deployer_with({ functions: { createFunction } });
    const result = await deployer.create(
      'oci.functions.function',
      'thumb',
      { application_id: 'ocid1.fnapp.oc1..a', image: 'iad.ocir.io/x/y:1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.fnfunc.oc1..x');
  });

  it('routes containerinstance.instance create through createContainerInstance', async () => {
    const createContainerInstance = vi.fn().mockResolvedValue({ containerInstance: { id: 'ocid1.ci.oc1..x' } });
    const deployer = deployer_with({ containerinstance: { createContainerInstance } });
    const result = await deployer.create('oci.containerinstance.instance', 'web', { image: 'reg/web:1' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.ci.oc1..x');
  });

  it('routes resourcescheduler.schedule create through createSchedule', async () => {
    const createSchedule = vi.fn().mockResolvedValue({ schedule: { id: 'ocid1.schedule.oc1..x' } });
    const deployer = deployer_with({ resourcescheduler: { createSchedule } });
    const result = await deployer.create('oci.resourcescheduler.schedule', 'nightly', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.schedule.oc1..x');
  });

  it('routes vault.secret create through createSecret', async () => {
    const createSecret = vi.fn().mockResolvedValue({ secret: { id: 'ocid1.secret.oc1..x' } });
    const deployer = deployer_with({ vault: { createSecret } });
    const result = await deployer.create(
      'oci.vault.secret',
      'api-key',
      { vault_id: 'ocid1.vault.oc1..v', kms_key_id: 'ocid1.key.oc1..k', value: 'hunter2' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.secret.oc1..x');
  });

  it('routes loadbalancer create through createLoadBalancer', async () => {
    const createLoadBalancer = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-1' });
    const deployer = deployer_with({ loadbalancer: { createLoadBalancer } });
    const result = await deployer.create('oci.loadbalancer.loadbalancer', 'lb', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-1');
  });

  it('routes dns.zone create through createZone', async () => {
    const createZone = vi.fn().mockResolvedValue({ zone: { id: 'ocid1.dnszone.oc1..x' } });
    const deployer = deployer_with({ dns: { createZone } });
    const result = await deployer.create('oci.dns.zone', 'example.com', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.dnszone.oc1..x');
  });

  it('routes apigateway.gateway create through createGateway', async () => {
    const createGateway = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-2' });
    const deployer = deployer_with({ apigateway: { createGateway } });
    const result = await deployer.create('oci.apigateway.gateway', 'gw', { subnet_id: 'ocid1.subnet.oc1..s' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-2');
  });

  it('routes core.privateaccessgateway create through createServiceGateway', async () => {
    const createServiceGateway = vi.fn().mockResolvedValue({ serviceGateway: { id: 'ocid1.servicegw.oc1..x' } });
    const deployer = deployer_with({ vnclient: { createServiceGateway } });
    const result = await deployer.create('oci.core.privateaccessgateway', 'sg', { vcn_id: 'v' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.servicegw.oc1..x');
  });

  it('routes containerengine.cluster create through createCluster', async () => {
    const createCluster = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-3' });
    const deployer = deployer_with({ containerengine: { createCluster } });
    const result = await deployer.create('oci.containerengine.cluster', 'oke', { vcn_id: 'v' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-3');
  });

  it('routes artifacts.repository create through createContainerRepository', async () => {
    const createContainerRepository = vi.fn().mockResolvedValue({ containerRepository: { id: 'ocid1.cr.oc1..x' } });
    const deployer = deployer_with({ artifacts: { createContainerRepository } });
    const result = await deployer.create('oci.artifacts.repository', 'reg', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('ocid1.cr.oc1..x');
  });

  it('routes identitydomains.user create through createUser', async () => {
    const createUser = vi.fn().mockResolvedValue({ user: { id: 'u-1' } });
    const deployer = deployer_with({ identitydomains: { createUser } });
    const result = await deployer.create('oci.identitydomains.user', 'alice', { email: 'a@e.co' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('u-1');
  });

  it('routes certificates.certificate create through createCertificate', async () => {
    const createCertificate = vi.fn().mockResolvedValue({ certificate: { id: 'c-1' } });
    const deployer = deployer_with({ certificatesmanagement: { createCertificate } });
    const result = await deployer.create(
      'oci.certificates.certificate',
      'cert',
      { cert_pem: 'cert', key_pem: 'key' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('c-1');
  });

  it('routes waf.policy create through createWebAppFirewallPolicy', async () => {
    const createWebAppFirewallPolicy = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-4' });
    const deployer = deployer_with({ waf: { createWebAppFirewallPolicy } });
    const result = await deployer.create('oci.waf.policy', 'pol', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-4');
  });

  it('routes logging.loggroup create through createLogGroup', async () => {
    const createLogGroup = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-5' });
    const deployer = deployer_with({ logging: { createLogGroup } });
    const result = await deployer.create('oci.logging.loggroup', 'lg', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-5');
  });

  it('routes queue.queue create through createQueue', async () => {
    const createQueue = vi.fn().mockResolvedValue({ opcWorkRequestId: 'wr-6' });
    const deployer = deployer_with({ queue: { createQueue } });
    const result = await deployer.create('oci.queue.queue', 'q', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('wr-6');
  });

  it('routes streaming.stream create through createStream', async () => {
    const createStream = vi.fn().mockResolvedValue({ stream: { id: 's-1' } });
    const deployer = deployer_with({ streaming: { createStream } });
    const result = await deployer.create('oci.streaming.stream', 'events', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('s-1');
  });

  it('routes ons.topic create through createTopic', async () => {
    const createTopic = vi.fn().mockResolvedValue({ notificationTopic: { topicId: 't-1' } });
    const deployer = deployer_with({ ons: { createTopic } });
    const result = await deployer.create('oci.ons.topic', 'pings', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('t-1');
  });

  it('routes monitoring.alarm create through createAlarm', async () => {
    const createAlarm = vi.fn().mockResolvedValue({ alarm: { id: 'a-1' } });
    const deployer = deployer_with({ monitoring: { createAlarm } });
    const result = await deployer.create(
      'oci.monitoring.alarm',
      'cpu',
      { metric_namespace: 'oci_computeagent', query: 'CpuUtilization[1m].mean() > 80' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('a-1');
  });

  it('reports SDK-missing when client thunk absent', async () => {
    const deployer = deployer_with({});
    const result = await deployer.create('oci.core.instance', 'web', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Install oci-core/);
  });

  it('reports unsupported for unknown oci.* types', async () => {
    const deployer = deployer_with({});
    const result = await deployer.create('oci.unknown.thing', 'x', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported resource type/);
  });
});
