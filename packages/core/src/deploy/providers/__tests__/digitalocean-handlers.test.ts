/**
 * Smoke tests for DigitalOcean handler dispatch.
 *
 * dots-wrapper exposes nested namespaces (`client.droplet`,
 * `client.database`, `client.app`, …). We inject a single fake client
 * object with the namespaces the test exercises.
 */

import { describe, expect, it, vi } from 'vitest';
import { DigitalOceanDeployer } from '../digitalocean/digitalocean-deployer';

function deployer_with(client: unknown, spaces_client?: unknown): DigitalOceanDeployer {
  const deployer = new DigitalOceanDeployer();
  (deployer as unknown as { ctx: any }).ctx = {
    region: 'nyc3',
    credentials: { access_token: 't', region: 'nyc3' },
    client,
    spaces_client,
  };
  return deployer;
}

describe('DigitalOcean handler dispatch', () => {
  it('routes droplet create through createDroplet', async () => {
    const createDroplet = vi.fn().mockResolvedValue({ data: { droplet: { id: 123 } } });
    const result = await deployer_with({ droplet: { createDroplet } }).create(
      'digitalocean.droplet.instance',
      'web',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('123');
  });

  it('routes apps.app create through createApp', async () => {
    const createApp = vi.fn().mockResolvedValue({ data: { app: { id: 'app-abc' } } });
    const result = await deployer_with({ app: { createApp } }).create('digitalocean.apps.app', 'web', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('app-abc');
  });

  it('routes databases.cluster create through createDatabaseCluster', async () => {
    const createDatabaseCluster = vi.fn().mockResolvedValue({ data: { database: { id: 'db-abc' } } });
    const result = await deployer_with({ database: { createDatabaseCluster } }).create(
      'digitalocean.databases.cluster',
      'app-db',
      { engine: 'postgres' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('db-abc');
  });

  it('routes loadbalancer.loadbalancer create through createLoadBalancer', async () => {
    const createLoadBalancer = vi.fn().mockResolvedValue({ data: { load_balancer: { id: 'lb-abc' } } });
    const result = await deployer_with({ loadBalancer: { createLoadBalancer } }).create(
      'digitalocean.loadbalancer.loadbalancer',
      'lb',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('lb-abc');
  });

  it('routes functions.namespace create through createNamespace', async () => {
    const createNamespace = vi.fn().mockResolvedValue({ data: { namespace: { namespace: 'fns-abc' } } });
    const result = await deployer_with({ functions: { createNamespace } }).create(
      'digitalocean.functions.namespace',
      'fns',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('fns-abc');
  });

  it('routes vpc.network create through createVpc', async () => {
    const createVpc = vi.fn().mockResolvedValue({ data: { vpc: { id: 'vpc-abc' } } });
    const result = await deployer_with({ vpc: { createVpc } }).create('digitalocean.vpc.network', 'net', {}, {});
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('vpc-abc');
  });

  it('routes domain.record create through createDomainRecord', async () => {
    const createDomainRecord = vi.fn().mockResolvedValue({ data: { domain_record: { id: 999 } } });
    const result = await deployer_with({ domain: { createDomainRecord } }).create(
      'digitalocean.domain.record',
      'www',
      { domain: 'example.com', value: '1.2.3.4' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('example.com/999');
  });

  it('routes firewall.firewall create through createFirewall', async () => {
    const createFirewall = vi.fn().mockResolvedValue({ data: { firewall: { id: 'fw-abc' } } });
    const result = await deployer_with({ firewall: { createFirewall } }).create(
      'digitalocean.firewall.firewall',
      'fw',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('fw-abc');
  });

  it('routes kubernetes.cluster create through createKubernetesCluster', async () => {
    const createKubernetesCluster = vi.fn().mockResolvedValue({ data: { kubernetes_cluster: { id: 'k8s-abc' } } });
    const result = await deployer_with({ kubernetes: { createKubernetesCluster } }).create(
      'digitalocean.kubernetes.cluster',
      'cluster',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('k8s-abc');
  });

  it('routes containerregistry.registry create through createContainerRegistry', async () => {
    const createContainerRegistry = vi.fn().mockResolvedValue({});
    const result = await deployer_with({ containerRegistry: { createContainerRegistry } }).create(
      'digitalocean.containerregistry.registry',
      'docr',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('docr');
  });

  it('routes volume.volume create through createVolume', async () => {
    const createVolume = vi.fn().mockResolvedValue({ data: { volume: { id: 'vol-abc' } } });
    const result = await deployer_with({ volume: { createVolume } }).create(
      'digitalocean.volume.volume',
      'vol',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('vol-abc');
  });

  it('routes droplet.snapshot create through snapshotDroplet', async () => {
    const snapshotDroplet = vi.fn().mockResolvedValue({ data: { action: { id: 7 } } });
    const result = await deployer_with({ dropletAction: { snapshotDroplet } }).create(
      'digitalocean.droplet.snapshot',
      'snap',
      { droplet_id: 42 },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('7');
  });

  it('routes monitoring.alertpolicy create through createAlertPolicy', async () => {
    const createAlertPolicy = vi.fn().mockResolvedValue({ data: { policy: { uuid: 'alert-abc' } } });
    const result = await deployer_with({ monitoring: { createAlertPolicy } }).create(
      'digitalocean.monitoring.alertpolicy',
      'cpu-high',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('alert-abc');
  });

  it('routes reservedip create through createReservedIp', async () => {
    const createReservedIp = vi.fn().mockResolvedValue({ data: { reserved_ip: { ip: '1.2.3.4' } } });
    const result = await deployer_with({ reservedIp: { createReservedIp } }).create(
      'digitalocean.reservedip.reservedip',
      'rip',
      {},
      {},
    );
    expect(result.success).toBe(true);
    expect(result.provider_id).toBe('1.2.3.4');
  });

  it('reports SDK-missing when client is null', async () => {
    const result = await deployer_with(null).create('digitalocean.droplet.instance', 'web', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Install dots-wrapper/);
  });

  it('reports unsupported for unknown digitalocean.* types', async () => {
    const result = await deployer_with({}).create('digitalocean.unknown.thing', 'x', {}, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported resource type/);
  });
});
