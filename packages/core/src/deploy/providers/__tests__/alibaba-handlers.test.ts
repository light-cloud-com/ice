/**
 * Smoke tests for the Alibaba Cloud P0 handlers.
 *
 * Each handler asks the deployer's lazy-loader for a typed client by
 * service short-name. The harness injects a stub client per service so
 * we can verify the dispatcher routes each `alibaba.<svc>.<kind>` to
 * the right method.
 */

import { describe, expect, it, vi } from 'vitest';
import { AlibabaDeployer } from '../alibaba/alibaba-deployer';

function fakeClient<R = any>(returnBody: R = {} as R) {
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== 'string') return undefined;
        return vi.fn().mockResolvedValue({ body: returnBody });
      },
    },
  );
}

function deployer_with_stubbed_clients(stubs: Record<string, unknown>): AlibabaDeployer {
  const deployer = new AlibabaDeployer();
  const clients = new Map<string, unknown>();
  for (const [service, client] of Object.entries(stubs)) {
    clients.set(service, { resolve: async () => client });
  }
  (deployer as unknown as { ctx: any }).ctx = {
    region: 'cn-hangzhou',
    credentials: { access_key_id: 'k', access_key_secret: 's', region: 'cn-hangzhou' },
    clients,
  };
  return deployer;
}

describe('Alibaba P0 handler dispatch', () => {
  it('routes ecs.instance create through ECS createInstance', async () => {
    const createInstance = vi.fn().mockResolvedValue({ body: { instanceId: 'i-abc' } });
    const startInstance = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ ecs: { createInstance, startInstance } });
    const result = await deployer.create('alibaba.ecs.instance', 'web', { image: 'aliyun_3' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('i-abc');
    expect(createInstance).toHaveBeenCalledOnce();
  });

  it('routes vpc.vpc create through VPC createVpc', async () => {
    const createVpc = vi.fn().mockResolvedValue({ body: { vpcId: 'vpc-abc' } });
    const deployer = deployer_with_stubbed_clients({ vpc: { createVpc } });
    const result = await deployer.create('alibaba.vpc.vpc', 'main', { cidr: '10.0.0.0/16' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('vpc-abc');
  });

  it('routes vpc.vSwitch create through VPC createVSwitch', async () => {
    const createVSwitch = vi.fn().mockResolvedValue({ body: { vSwitchId: 'vsw-abc' } });
    const deployer = deployer_with_stubbed_clients({ vpc: { createVSwitch } });
    const result = await deployer.create('alibaba.vpc.vSwitch', 's1', { vpc_id: 'vpc-abc' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('vsw-abc');
  });

  it('routes ecs.securityGroup create + rules through ECS authorizeSecurityGroup', async () => {
    const createSecurityGroup = vi.fn().mockResolvedValue({ body: { securityGroupId: 'sg-abc' } });
    const authorizeSecurityGroup = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ ecs: { createSecurityGroup, authorizeSecurityGroup } });
    const result = await deployer.create(
      'alibaba.ecs.securityGroup',
      'web-sg',
      { inbound_rules: [{ port: 443, cidr: '0.0.0.0/0', protocol: 'tcp' }] },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('sg-abc');
    expect(authorizeSecurityGroup).toHaveBeenCalledOnce();
  });

  it('routes oss.bucket create through OSS putBucketWithOptions', async () => {
    const putBucketWithOptions = vi.fn().mockResolvedValue({ body: {} });
    const deployer = deployer_with_stubbed_clients({ oss: { putBucketWithOptions } });
    const result = await deployer.create('alibaba.oss.bucket', 'data-bucket-123', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('data-bucket-123');
  });

  it('routes rds.dbInstance create through RDS createDBInstance', async () => {
    const createDBInstance = vi.fn().mockResolvedValue({ body: { DBInstanceId: 'rm-abc' } });
    const deployer = deployer_with_stubbed_clients({ rds: { createDBInstance } });
    const result = await deployer.create('alibaba.rds.dbInstance', 'app-db', { engine: 'postgres' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('rm-abc');
  });

  it('routes dds.dbInstance create through MongoDB createDBInstance', async () => {
    const createDBInstance = vi.fn().mockResolvedValue({ body: { DBInstanceId: 'mongo-abc' } });
    const deployer = deployer_with_stubbed_clients({ dds: { createDBInstance } });
    const result = await deployer.create('alibaba.dds.dbInstance', 'docs-db', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('mongo-abc');
  });

  it('routes kvstore.instance create through KVStore createInstance', async () => {
    const createInstance = vi.fn().mockResolvedValue({ body: { instanceId: 'r-abc' } });
    const deployer = deployer_with_stubbed_clients({ kvstore: { createInstance } });
    const result = await deployer.create('alibaba.kvstore.instance', 'cache', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('r-abc');
  });

  it('routes mns.queue create through MNS createQueue', async () => {
    const createQueue = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ mns: { createQueue } });
    const result = await deployer.create('alibaba.mns.queue', 'tasks', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('tasks');
  });

  it('routes mns.topic create through MNS createTopic', async () => {
    const createTopic = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ mns: { createTopic } });
    const result = await deployer.create('alibaba.mns.topic', 'events', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('events');
  });

  it('routes fc.function create through FC createFunction', async () => {
    const createFunction = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ fc: { createFunction } });
    const result = await deployer.create('alibaba.fc.function', 'thumb', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('thumb');
  });

  it('routes sae.application create through SAE createApplication', async () => {
    const createApplication = vi.fn().mockResolvedValue({ body: { Data: { AppId: 'app-abc' } } });
    const deployer = deployer_with_stubbed_clients({ sae: { createApplication } });
    const result = await deployer.create('alibaba.sae.application', 'web', { image: 'reg/web:1' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('app-abc');
  });

  it('routes eci.containerGroup create through ECI createContainerGroup', async () => {
    const createContainerGroup = vi.fn().mockResolvedValue({ body: { containerGroupId: 'eci-abc' } });
    const deployer = deployer_with_stubbed_clients({ eci: { createContainerGroup } });
    const result = await deployer.create('alibaba.eci.containerGroup', 'worker', { image: 'reg/worker:1' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('eci-abc');
  });

  it('routes eventbridge.rule create through EventBridge createRule', async () => {
    const createRule = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ eventbridge: { createRule } });
    const result = await deployer.create(
      'alibaba.eventbridge.rule',
      'nightly',
      { schedule_expression: 'cron(0 0 * * ? *)' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('nightly');
  });

  it('routes kms.secret create through KMS createSecret', async () => {
    const createSecret = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ kms: { createSecret } });
    const result = await deployer.create('alibaba.kms.secret', 'api-key', { value: 'hunter2' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('api-key');
  });

  it('routes slb.loadBalancer create through SLB createLoadBalancer', async () => {
    const createLoadBalancer = vi.fn().mockResolvedValue({ body: { loadBalancerId: 'lb-abc' } });
    const deployer = deployer_with_stubbed_clients({ slb: { createLoadBalancer } });
    const result = await deployer.create('alibaba.slb.loadBalancer', 'app-lb', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('lb-abc');
  });

  it('routes alidns.domainRecord create through addDomainRecord', async () => {
    const addDomainRecord = vi.fn().mockResolvedValue({ body: { recordId: 'rec-abc' } });
    const deployer = deployer_with_stubbed_clients({ alidns: { addDomainRecord } });
    const result = await deployer.create(
      'alibaba.alidns.domainRecord',
      'www',
      { domain: 'example.com', value: '1.2.3.4' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('rec-abc');
  });

  it('routes cs.managedCluster create through ACK createCluster', async () => {
    const createCluster = vi.fn().mockResolvedValue({ body: { clusterId: 'c-abc' } });
    const deployer = deployer_with_stubbed_clients({ cs: { createCluster } });
    const result = await deployer.create('alibaba.cs.managedCluster', 'prod', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('c-abc');
  });

  it('routes cr.instance create through CR getInstance (marketplace-provisioned)', async () => {
    const getInstance = vi.fn().mockResolvedValue({ body: { instanceId: 'cri-abc' } });
    const deployer = deployer_with_stubbed_clients({ cr: { getInstance } });
    const result = await deployer.create('alibaba.cr.instance', 'reg', { instance_id: 'cri-abc' }, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('cri-abc');
  });

  it('routes cdn.domain create through addCdnDomain', async () => {
    const addCdnDomain = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ cdn: { addCdnDomain } });
    const result = await deployer.create(
      'alibaba.cdn.domain',
      'static.example.com',
      { origin: 'b.oss.aliyuncs.com' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('static.example.com');
  });

  it('routes amqp.instance create through createInstance', async () => {
    const createInstance = vi.fn().mockResolvedValue({ body: { data: 'amqp-abc' } });
    const deployer = deployer_with_stubbed_clients({ amqp: { createInstance } });
    const result = await deployer.create('alibaba.amqp.instance', 'rmq', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('amqp-abc');
  });

  it('routes maxcompute.project create through createProject', async () => {
    const createProject = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ maxcompute: { createProject } });
    const result = await deployer.create('alibaba.maxcompute.project', 'dwh', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('dwh');
  });

  it('routes paieas.service create through createService', async () => {
    const createService = vi.fn().mockResolvedValue({});
    const deployer = deployer_with_stubbed_clients({ pai: { createService } });
    const result = await deployer.create('alibaba.paieas.service', 'inference', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('inference');
  });

  it('reports SDK-missing when no client thunk registered', async () => {
    const deployer = deployer_with_stubbed_clients({});
    const result = await deployer.create('alibaba.ecs.instance', 'web', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Install @alicloud\/ecs/);
  });

  it('reports unsupported for unknown alibaba.* types', async () => {
    const deployer = deployer_with_stubbed_clients({});
    const result = await deployer.create('alibaba.unknown.thing', 'x', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported resource type/);
  });
});
