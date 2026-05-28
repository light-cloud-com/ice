/**
 * Smoke tests for IBM Cloud handler dispatch.
 */

import { describe, expect, it, vi } from 'vitest';
import { IBMDeployer } from '../ibm/ibm-deployer';

function deployer_with(stubs: Record<string, unknown>): IBMDeployer {
  const deployer = new IBMDeployer();
  const clients = new Map<string, unknown>();
  for (const [service, client] of Object.entries(stubs)) {
    clients.set(service, { resolve: async () => client });
  }
  (deployer as unknown as { ctx: any }).ctx = {
    region: 'us-south',
    resource_group_id: 'rg-1',
    account_id: 'acct-1',
    credentials: { api_key: 'k', region: 'us-south' },
    clients,
  };
  return deployer;
}

describe('IBM Cloud handler dispatch', () => {
  it('routes codeengine.application create through createApp', async () => {
    const createApp = vi.fn().mockResolvedValue({ result: { id: 'app-1' } });
    const result = await deployer_with({ codeengine: { createApp } }).create(
      'ibm.codeengine.application',
      'web',
      { project_id: 'p1', image: 'icr/web:1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('p1/app-1');
  });

  it('routes codeengine.function create through createFunction', async () => {
    const createFunction = vi.fn().mockResolvedValue({});
    const result = await deployer_with({ codeengine: { createFunction } }).create(
      'ibm.codeengine.function',
      'thumb',
      { project_id: 'p1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('p1/thumb');
  });

  it('routes codeengine.job create through createJob', async () => {
    const createJob = vi.fn().mockResolvedValue({});
    const result = await deployer_with({ codeengine: { createJob } }).create(
      'ibm.codeengine.job',
      'batch',
      { project_id: 'p1', image: 'icr/job:1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('p1/batch');
  });

  it('routes vpc.vpc create through createVpc', async () => {
    const createVpc = vi.fn().mockResolvedValue({ result: { id: 'vpc-1' } });
    const result = await deployer_with({ vpc: { createVpc } }).create('ibm.vpc.vpc', 'main', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('vpc-1');
  });

  it('routes vpc.subnet create through createSubnet', async () => {
    const createSubnet = vi.fn().mockResolvedValue({ result: { id: 'sn-1' } });
    const result = await deployer_with({ vpc: { createSubnet } }).create(
      'ibm.vpc.subnet',
      's',
      { vpc_id: 'vpc-1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('sn-1');
  });

  it('routes vpc.instance create through createInstance', async () => {
    const createInstance = vi.fn().mockResolvedValue({ result: { id: 'i-1' } });
    const result = await deployer_with({ vpc: { createInstance } }).create(
      'ibm.vpc.instance',
      'web',
      { vpc_id: 'vpc-1', subnet_id: 'sn-1', image_id: 'img-1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('i-1');
  });

  it('routes vpc.securitygroup create through createSecurityGroup', async () => {
    const createSecurityGroup = vi.fn().mockResolvedValue({ result: { id: 'sg-1' } });
    const result = await deployer_with({ vpc: { createSecurityGroup } }).create(
      'ibm.vpc.securitygroup',
      'sg',
      { vpc_id: 'vpc-1' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('sg-1');
  });

  it('routes vpc.loadbalancer create through createLoadBalancer', async () => {
    const createLoadBalancer = vi.fn().mockResolvedValue({ result: { id: 'lb-1' } });
    const result = await deployer_with({ vpc: { createLoadBalancer } }).create(
      'ibm.vpc.loadbalancer',
      'lb',
      { subnet_ids: ['sn-1'] },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('lb-1');
  });

  it('routes databases.postgresql create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:db-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.databases.postgresql',
      'pg',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:db-1');
  });

  it('routes databases.mysql create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:db-2' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.databases.mysql',
      'mysql',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:db-2');
  });

  it('routes databases.mongodb create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:db-3' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.databases.mongodb',
      'mongo',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:db-3');
  });

  it('routes databases.redis create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:db-4' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.databases.redis',
      'redis',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:db-4');
  });

  it('routes secretsmanager.secret create through createSecret', async () => {
    const createSecret = vi.fn().mockResolvedValue({ result: { id: 'secret-1' } });
    const result = await deployer_with({ secretsmanager: { createSecret } }).create(
      'ibm.secretsmanager.secret',
      'api-key',
      { value: 'hunter2' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('secret-1');
  });

  it('routes cis.zone create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:cis-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.cis.zone',
      'example.com',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:cis-1');
  });

  it('routes containers.cluster create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:iks-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.containers.cluster',
      'iks',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:iks-1');
  });

  it('routes appid.instance create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:appid-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.appid.instance',
      'identity',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:appid-1');
  });

  it('routes logging.instance create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:logdna-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.logging.instance',
      'logs',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:logdna-1');
  });

  it('routes cloudant.database create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:cloudant-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.cloudant.database',
      'docs',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:cloudant-1');
  });

  it('routes eventstreams.topic create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:es-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.eventstreams.topic',
      'events',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:es-1');
  });

  it('routes watsonx.deployment create through createResourceInstance', async () => {
    const createResourceInstance = vi.fn().mockResolvedValue({ result: { id: 'crn:wx-1' } });
    const result = await deployer_with({ resourcecontroller: { createResourceInstance } }).create(
      'ibm.watsonx.deployment',
      'project',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('crn:wx-1');
  });

  it('reports SDK-missing when client thunk absent', async () => {
    const deployer = deployer_with({});
    const result = await deployer.create('ibm.vpc.vpc', 'main', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Install ibm-vpc/);
  });

  it('reports unsupported for unknown ibm.* types', async () => {
    const result = await deployer_with({}).create('ibm.unknown.thing', 'x', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported resource type/);
  });
});
