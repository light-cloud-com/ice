/**
 * Port derivation tests — pinning the user's explicit examples:
 * GitHub → Frontend matches by `repository` role, Frontend → Domain
 * matches by `domain` role, multi-port blocks emit one port per
 * exposed_ports entry, containers expose nothing.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getPortsForNode, hasPort, findPort, _resetPortCache, type NodeForPorts } from '../derive';
import { canPortsConnect } from '../match';
import type { PortDef } from '../types';

beforeEach(() => {
  _resetPortCache();
});

function node(iceType: string, extra: Record<string, unknown> = {}, type?: string): NodeForPorts {
  return { id: 't', data: { iceType, ...extra }, type };
}

function ids(ports: PortDef[]): string[] {
  return ports.map((p) => p.id);
}

describe('user example chain — GitHub → Frontend → Domain', () => {
  it('Source.Repository exposes a single repository-out', () => {
    const ports = getPortsForNode(node('Source.Repository'));
    expect(ids(ports)).toEqual(['repository-out']);
    expect(ports[0].direction).toBe('out');
    expect(ports[0].role).toBe('repository');
  });

  it('Compute.StaticSite has matching repository-in (+ env, secret, domain inputs + web/logs outputs)', () => {
    const ports = getPortsForNode(node('Compute.StaticSite'));
    const portIds = ids(ports);
    expect(portIds).toContain('repository-in');
    expect(portIds).toContain('env-in');
    expect(portIds).toContain('secret-in');
    expect(portIds).toContain('domain-in');
    expect(portIds).toContain('web-out');
    expect(portIds).toContain('logs-out');
  });

  it("Repo's repository-out connects to Frontend's repository-in (role match)", () => {
    const repoOut = findPort(node('Source.Repository'), 'repository-out')!;
    const frontendIn = findPort(node('Compute.StaticSite'), 'repository-in')!;
    expect(canPortsConnect(repoOut, frontendIn)).toBe(true);
  });

  it("Repo's repository-out does NOT connect to Frontend's domain-in (role mismatch)", () => {
    const repoOut = findPort(node('Source.Repository'), 'repository-out')!;
    const frontendDomainIn = findPort(node('Compute.StaticSite'), 'domain-in')!;
    expect(canPortsConnect(repoOut, frontendDomainIn)).toBe(false);
  });

  it("Network.CustomDomain's domain-out connects to Frontend's domain-in", () => {
    const domainOut = findPort(node('Network.CustomDomain'), 'domain-out')!;
    const frontendDomainIn = findPort(node('Compute.StaticSite'), 'domain-in')!;
    expect(canPortsConnect(domainOut, frontendDomainIn)).toBe(true);
  });
});

describe('backend wiring — Postgres / Redis / Queue', () => {
  it('Database.PostgreSQL.db-out connects to Compute.Container.db-in', () => {
    const dbOut = findPort(node('Database.PostgreSQL'), 'db-out')!;
    const backendDbIn = findPort(node('Compute.Container'), 'db-in')!;
    expect(canPortsConnect(dbOut, backendDbIn)).toBe(true);
  });

  it('Database.Redis exposes a cache-out (not db-out — Redis is a cache)', () => {
    const ports = ids(getPortsForNode(node('Database.Redis')));
    expect(ports).toContain('cache-out');
    expect(ports).not.toContain('db-out');
  });

  it('Backend publishes to Queue: backend.queue-out → queue.queue-in', () => {
    const backendQueueOut = findPort(node('Compute.Container'), 'queue-out')!;
    const queueIn = findPort(node('Messaging.Queue'), 'queue-in')!;
    expect(canPortsConnect(backendQueueOut, queueIn)).toBe(true);
  });

  it('Queue → Backend subscribers: queue.queue-out → backend.queue-in', () => {
    const queueOut = findPort(node('Messaging.Queue'), 'queue-out')!;
    const backendQueueIn = findPort(node('Compute.Container'), 'queue-in')!;
    expect(canPortsConnect(queueOut, backendQueueIn)).toBe(true);
  });
});

describe('containers and non-deployables', () => {
  it.each(['Network.VPC', 'Network.Subnet', 'Group.Frontend', 'Group.Custom'])('%s emits no ports', (iceType) => {
    expect(getPortsForNode(node(iceType))).toEqual([]);
  });

  it('Network.PrivateNetwork has empty base ports (container)', () => {
    expect(getPortsForNode(node('Network.PrivateNetwork'))).toEqual([]);
  });

  it('Util.Reroute has any-role in + any-role out so wires pass through', () => {
    const ports = getPortsForNode(node('Util.Reroute'));
    expect(ports.map((p) => p.role)).toEqual(['any', 'any']);
    const passIn = ports[0];
    const dbOut = findPort(node('Database.PostgreSQL'), 'db-out')!;
    expect(canPortsConnect(dbOut, passIn)).toBe(true);
  });
});

describe('property-anchored IN ports', () => {
  it('Frontend domain-in writes to property=custom_domain', () => {
    const p = findPort(node('Compute.StaticSite'), 'domain-in')!;
    expect(p.property).toBe('custom_domain');
  });

  it('Frontend repository-in writes to property=repository', () => {
    const p = findPort(node('Compute.StaticSite'), 'repository-in')!;
    expect(p.property).toBe('repository');
  });
});

describe('peerStyle coloring', () => {
  it("Frontend's domain-in carries peerStyle='Network' (reads as Custom Domain)", () => {
    expect(findPort(node('Compute.StaticSite'), 'domain-in')?.peerStyle).toBe('Network');
  });

  it("Frontend's repository-in carries peerStyle='Source'", () => {
    expect(findPort(node('Compute.StaticSite'), 'repository-in')?.peerStyle).toBe('Source');
  });
});

describe('hasPort / findPort', () => {
  it('hasPort returns true for an existing port', () => {
    expect(hasPort(node('Compute.StaticSite'), 'domain-in')).toBe(true);
    expect(hasPort(node('Compute.StaticSite'), 'nonexistent')).toBe(false);
  });
});

describe('multi-route (Network.CustomDomain routes)', () => {
  it('exposes the fallback domain-out when no routes are configured', () => {
    const ports = getPortsForNode(node('Network.CustomDomain'));
    const ids2 = ids(ports);
    expect(ids2).toContain('domain-out');
    expect(ids2.filter((id) => id.startsWith('domain-out-'))).toEqual([]);
  });

  it('emits one socket per route and hides the fallback when routes are set', () => {
    const ports = getPortsForNode(
      node('Network.CustomDomain', {
        routes: [
          { id: 'r1', subdomain: 'api' },
          { id: 'r2', subdomain: 'admin' },
        ],
      }),
    );
    const ids2 = ids(ports);
    expect(ids2).not.toContain('domain-out');
    expect(ids2).toContain('domain-out-r1');
    expect(ids2).toContain('domain-out-r2');
  });

  it('labels each route socket with the subdomain text', () => {
    const ports = getPortsForNode(node('Network.CustomDomain', { routes: [{ id: 'r1', subdomain: 'api' }] }));
    const apiPort = ports.find((p) => p.id === 'domain-out-r1');
    expect(apiPort?.label).toBe('api');
  });

  it('each route socket carries the same peer-kind constraint as the fallback', () => {
    const ports = getPortsForNode(node('Network.CustomDomain', { routes: [{ id: 'r1', subdomain: 'api' }] }));
    const apiPort = ports.find((p) => p.id === 'domain-out-r1');
    expect(apiPort?.peerKind).toBe('service');
  });
});

describe('multi-port (Compute.Container exposed_ports)', () => {
  it('default Container exposes one web-out (HTTPS :8080) when no exposed_ports set', () => {
    const ports = getPortsForNode(node('Compute.Container'));
    const ids2 = ids(ports);
    expect(ids2.filter((id) => id.endsWith('-out'))).toContain('web-out');
  });

  it('emits one port per exposed_ports entry (JSON form)', () => {
    const ports = getPortsForNode(
      node('Compute.Container', {
        exposed_ports: [
          JSON.stringify({ port: 8080, protocol: 'http', label: 'api' }),
          JSON.stringify({ port: 8443, protocol: 'https' }),
          JSON.stringify({ port: 22, protocol: 'tcp', label: 'ssh' }),
        ],
      }),
    );
    const dynamicIds = ports.filter((p) => p.removable).map((p) => p.id);
    expect(dynamicIds).toEqual(['port-8080-out', 'port-8443-out', 'port-22-out']);
  });

  it('hides the default web-out once the user declares any exposed_ports', () => {
    const ports = getPortsForNode(
      node('Compute.Container', {
        exposed_ports: [JSON.stringify({ port: 8080, protocol: 'http' })],
      }),
    );
    expect(ports.some((p) => p.id === 'web-out')).toBe(false);
    expect(ports.some((p) => p.id === 'port-8080-out')).toBe(true);
  });

  it('parses compact text form "https:443:api"', () => {
    const ports = getPortsForNode(node('Compute.Container', { exposed_ports: ['https:443:api'] }));
    const userPort = ports.find((p) => p.removable);
    expect(userPort?.port).toBe(443);
    expect(userPort?.protocol).toBe('https');
    expect(userPort?.label).toContain('443');
    expect(userPort?.label).toContain('api');
  });

  it('skips malformed entries silently rather than throwing', () => {
    const ports = getPortsForNode(
      node('Compute.Container', { exposed_ports: ['nonsense', '', JSON.stringify({ port: 9000 })] }),
    );
    const dynamic = ports.filter((p) => p.removable);
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0].port).toBe(9000);
  });

  it('Compute.BackendAPI mirrors Container behavior — exposed_ports honored', () => {
    const ports = getPortsForNode(
      node('Compute.BackendAPI', { exposed_ports: [JSON.stringify({ port: 3000, protocol: 'http' })] }),
    );
    expect(ports.some((p) => p.id === 'port-3000-out')).toBe(true);
    expect(ports.some((p) => p.id === 'web-out')).toBe(false);
  });

  it('Compute.Worker has NO exposed_ports schema (single-port category)', () => {
    const ports = getPortsForNode(node('Compute.Worker', { exposed_ports: ['https:443'] }));
    // Worker schema ignores exposed_ports — port_list only ships on Container + BackendAPI.
    expect(ports.some((p) => p.id === 'port-443-out')).toBe(false);
  });
});

describe('memoization', () => {
  it('repeated calls with same data return the same array', () => {
    const a = getPortsForNode(node('Compute.StaticSite'));
    const b = getPortsForNode(node('Compute.StaticSite'));
    expect(a).toBe(b);
  });

  it('different iceType invalidates cache', () => {
    const a = getPortsForNode(node('Compute.StaticSite'));
    const b = getPortsForNode(node('Compute.Container'));
    expect(a).not.toBe(b);
  });
});
