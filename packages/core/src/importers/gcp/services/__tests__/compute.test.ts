/**
 * Tests for ComputeService — discovers Compute Engine resources via the
 * @google-cloud/compute SDK.
 *
 * The SUT loads the SDK through a `Function('moduleName', 'return
 * import(moduleName)')` indirection, which Vitest cannot intercept with
 * `vi.mock`. We therefore bypass `init_clients()` entirely by writing
 * a fake clients dict to the private `clients` field; the only thing
 * that needs `init_clients` to actually fire is the error-on-init test
 * (where we point the SUT at an unresolvable module name to trigger
 * the catch arm).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputeService } from '../compute.js';

interface FakeClients {
  instances: { list: ReturnType<typeof vi.fn> };
  disks: { list: ReturnType<typeof vi.fn> };
  networks: { list: ReturnType<typeof vi.fn> };
  subnetworks: { list: ReturnType<typeof vi.fn> };
  firewalls: { list: ReturnType<typeof vi.fn> };
}

function makeClients(): FakeClients {
  return {
    instances: { list: vi.fn().mockResolvedValue([[]]) },
    disks: { list: vi.fn().mockResolvedValue([[]]) },
    networks: { list: vi.fn().mockResolvedValue([[]]) },
    subnetworks: { list: vi.fn().mockResolvedValue([[]]) },
    firewalls: { list: vi.fn().mockResolvedValue([[]]) },
  };
}

function makeService(clients: FakeClients | null) {
  const svc = new ComputeService('proj', ['us-central1', 'europe-west1'], ['us-central1-a', 'us-central1-b']);
  // Bypass init_clients
  (svc as any).clients = clients;
  return svc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComputeService.service_type', () => {
  it('returns "compute"', () => {
    const svc = new ComputeService('p', [], []);
    expect(svc.service_type).toBe('compute');
  });
});

describe('ComputeService.discover — happy paths', () => {
  it('lists instances in every zone and emits compute#instance resources', async () => {
    const clients = makeClients();
    clients.instances.list
      .mockResolvedValueOnce([[{ selfLink: 'sl-i-a', name: 'i-a' }]])
      .mockResolvedValueOnce([[{ selfLink: 'sl-i-b', name: 'i-b' }]]);

    const svc = makeService(clients);
    const result = await svc.discover();

    expect(clients.instances.list).toHaveBeenCalledWith({ project: 'proj', zone: 'us-central1-a' });
    expect(clients.instances.list).toHaveBeenCalledWith({ project: 'proj', zone: 'us-central1-b' });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.resources.filter((r) => r.kind === 'compute#instance')).toHaveLength(2);
    const inst = result.resources.find((r) => r.name === 'i-a');
    expect(inst?.zone).toBe('us-central1-a');
  });

  it('lists disks in every zone and emits compute#disk resources', async () => {
    const clients = makeClients();
    clients.disks.list.mockResolvedValueOnce([[{ name: 'disk-1' }]]).mockResolvedValueOnce([[]]);
    const svc = makeService(clients);
    const result = await svc.discover();
    const disks = result.resources.filter((r) => r.kind === 'compute#disk');
    expect(disks).toHaveLength(1);
    expect(disks[0]!.zone).toBe('us-central1-a');
  });

  it('lists networks (global) — uses project, no zone/region', async () => {
    const clients = makeClients();
    clients.networks.list.mockResolvedValueOnce([[{ selfLink: 'sl-n', name: 'default' }]]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(clients.networks.list).toHaveBeenCalledWith({ project: 'proj' });
    const net = result.resources.find((r) => r.kind === 'compute#network');
    expect(net).toBeDefined();
    expect(net?.zone).toBeUndefined();
    expect(net?.region).toBeUndefined();
  });

  it('lists subnetworks per region', async () => {
    const clients = makeClients();
    clients.subnetworks.list.mockResolvedValueOnce([[{ name: 'sn-1' }]]).mockResolvedValueOnce([[]]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(clients.subnetworks.list).toHaveBeenCalledWith({ project: 'proj', region: 'us-central1' });
    expect(clients.subnetworks.list).toHaveBeenCalledWith({ project: 'proj', region: 'europe-west1' });
    const sn = result.resources.filter((r) => r.kind === 'compute#subnetwork');
    expect(sn).toHaveLength(1);
    expect(sn[0]!.region).toBe('us-central1');
  });

  it('lists firewall rules globally', async () => {
    const clients = makeClients();
    clients.firewalls.list.mockResolvedValueOnce([[{ name: 'fw-1' }]]);
    const svc = makeService(clients);
    const result = await svc.discover();
    const fw = result.resources.filter((r) => r.kind === 'compute#firewall');
    expect(fw).toHaveLength(1);
  });

  it('handles a list() returning [null] without throwing (instances `|| []` fallback)', async () => {
    const clients = makeClients();
    clients.instances.list.mockResolvedValue([null]);
    const svc = makeService(clients);
    const result = await svc.discover();
    // Each zone gets through; no resources, no errors
    expect(result.resources.filter((r) => r.kind === 'compute#instance')).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('disks list returning [null] takes the `|| []` fallback', async () => {
    const clients = makeClients();
    clients.disks.list.mockResolvedValue([null]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.resources.filter((r) => r.kind === 'compute#disk')).toEqual([]);
  });

  it('networks list returning [null] takes the `|| []` fallback', async () => {
    const clients = makeClients();
    clients.networks.list.mockResolvedValue([null]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.resources.filter((r) => r.kind === 'compute#network')).toEqual([]);
  });

  it('subnetworks list returning [null] takes the `|| []` fallback', async () => {
    const clients = makeClients();
    clients.subnetworks.list.mockResolvedValue([null]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.resources.filter((r) => r.kind === 'compute#subnetwork')).toEqual([]);
  });

  it('firewalls list returning [null] takes the `|| []` fallback', async () => {
    const clients = makeClients();
    clients.firewalls.list.mockResolvedValue([null]);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.resources.filter((r) => r.kind === 'compute#firewall')).toEqual([]);
  });
});

describe('ComputeService.discover — error vs warning classification', () => {
  it('records a warning for instances when err.code is 403', async () => {
    const clients = makeClients();
    clients.instances.list.mockRejectedValue({ code: 403, message: 'forbidden' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('us-central1-a'))).toBe(true);
    expect(result.errors.some((e) => e.code === 'API_ERROR')).toBe(false);
  });

  it('records a warning for instances when err.code is 404', async () => {
    const clients = makeClients();
    clients.instances.list.mockRejectedValue({ code: 404, message: 'gone' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED')).toBe(true);
  });

  it('records an error for instances when err.code is some other number', async () => {
    const clients = makeClients();
    clients.instances.list.mockRejectedValue({ code: 500, message: 'kaboom' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('kaboom'))).toBe(true);
  });

  it('falls back to "Access denied" message text when err.message is empty (instances)', async () => {
    const clients = makeClients();
    clients.instances.list.mockRejectedValue({ code: 403 });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings[0]!.message).toContain('Access denied');
  });

  it('uses String(error) when err.message is missing on the API_ERROR path (instances)', async () => {
    const clients = makeClients();
    const e = { code: 500, toString: () => 'stringified-error' };
    clients.instances.list.mockRejectedValue(e);
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.find((er) => er.code === 'API_ERROR')!.message).toContain('stringified-error');
  });

  it('records a warning for disks on 403', async () => {
    const clients = makeClients();
    clients.disks.list.mockRejectedValue({ code: 403, message: 'no perm' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('disks'))).toBe(true);
  });

  it('records an API_ERROR for disks on 500 with String(error) fallback', async () => {
    const clients = makeClients();
    clients.disks.list.mockRejectedValue({ code: 500 });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('disks'))).toBe(true);
  });

  it('records a warning for networks on 403', async () => {
    const clients = makeClients();
    clients.networks.list.mockRejectedValue({ code: 403, message: 'forbidden' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('networks'))).toBe(true);
  });

  it('records an API_ERROR for networks on 500', async () => {
    const clients = makeClients();
    clients.networks.list.mockRejectedValue({ code: 500, message: 'oh no' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('oh no'))).toBe(true);
  });

  it('falls back to "Access denied" for networks when err.message is missing', async () => {
    const clients = makeClients();
    clients.networks.list.mockRejectedValue({ code: 403 });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.find((w) => w.message.includes('networks'))!.message).toContain('Access denied');
  });

  it('records a warning for subnetworks on 404', async () => {
    const clients = makeClients();
    clients.subnetworks.list.mockRejectedValue({ code: 404, message: 'gone' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('us-central1'))).toBe(true);
  });

  it('records an API_ERROR for subnetworks on 500', async () => {
    const clients = makeClients();
    clients.subnetworks.list.mockRejectedValue({ code: 500, message: 'boom' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('subnetworks'))).toBe(true);
  });

  it('records a warning for firewalls on 403', async () => {
    const clients = makeClients();
    clients.firewalls.list.mockRejectedValue({ code: 403, message: 'no' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.warnings.some((w) => w.code === 'ACCESS_DENIED' && w.message.includes('firewall'))).toBe(true);
  });

  it('records an API_ERROR for firewalls on 500', async () => {
    const clients = makeClients();
    clients.firewalls.list.mockRejectedValue({ code: 500, message: 'kapow' });
    const svc = makeService(clients);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'API_ERROR' && e.message.includes('firewall'))).toBe(true);
  });

  it('falls back to "Access denied" / String(error) for the remaining services when message is missing', async () => {
    // disks ACCESS_DENIED-no-message
    const c1 = makeClients();
    c1.disks.list.mockRejectedValue({ code: 403 });
    expect((await makeService(c1).discover()).warnings.find((w) => w.message.includes('disks'))!.message).toContain(
      'Access denied',
    );
    // disks API_ERROR no message → String(err)
    const c2 = makeClients();
    c2.disks.list.mockRejectedValue({});
    expect((await makeService(c2).discover()).errors.find((e) => e.message.includes('disks'))).toBeDefined();

    // networks API_ERROR string fallback
    const c3 = makeClients();
    c3.networks.list.mockRejectedValue({});
    expect((await makeService(c3).discover()).errors.find((e) => e.message.includes('networks'))).toBeDefined();

    // subnetworks ACCESS_DENIED-no-message
    const c4 = makeClients();
    c4.subnetworks.list.mockRejectedValue({ code: 403 });
    expect((await makeService(c4).discover()).warnings.find((w) => w.message.includes('subnetworks'))!.message).toContain(
      'Access denied',
    );
    // subnetworks API_ERROR no message → String(err)
    const c5 = makeClients();
    c5.subnetworks.list.mockRejectedValue({});
    expect((await makeService(c5).discover()).errors.find((e) => e.message.includes('subnetworks'))).toBeDefined();

    // firewalls ACCESS_DENIED-no-message
    const c6 = makeClients();
    c6.firewalls.list.mockRejectedValue({ code: 403 });
    expect((await makeService(c6).discover()).warnings.find((w) => w.message.includes('firewall'))!.message).toContain(
      'Access denied',
    );
    // firewalls API_ERROR no message → String(err)
    const c7 = makeClients();
    c7.firewalls.list.mockRejectedValue({});
    expect((await makeService(c7).discover()).errors.find((e) => e.message.includes('firewall'))).toBeDefined();
  });
});

describe('ComputeService.discover — clients-not-initialized branch', () => {
  it('returns INIT_ERROR when init_clients silently leaves clients as null', async () => {
    // Subclass that overrides init_clients to a no-op so the post-init null-check fires
    class NoInitCompute extends ComputeService {
      // @ts-expect-error overriding private
      private async init_clients(): Promise<void> {
        // intentionally do nothing — `clients` stays null
      }
    }
    const svc = new NoInitCompute('p', ['us-central1'], ['us-central1-a']);
    const result = await svc.discover();
    expect(result.errors.some((e) => e.code === 'INIT_ERROR')).toBe(true);
  });
});

describe('ComputeService — init_clients success path (Function ctor monkey-patch)', () => {
  // The SUT's `Function('moduleName', 'return import(moduleName)')(module_name)`
  // call cannot be intercepted via vi.mock because `Function`'s body runs in a
  // detached scope. We patch the global `Function` constructor for the duration
  // of one test to redirect the dynamic import to a fake module.

  it('builds all five clients, applies projectId + keyFilename, then returns no INIT_ERROR', async () => {
    const ctorCalls: Array<{ ctor: string; args: unknown[] }> = [];
    // Use a real `class` so `new ClientCtor(...)` works — vi.fn().mockImplementation
    // with an arrow function is NOT constructible.
    function makeCtorClass(name: string): new (opts: unknown) => { list: () => Promise<[unknown[]]> } {
      return class {
        list: () => Promise<[unknown[]]>;
        constructor(opts: unknown) {
          ctorCalls.push({ ctor: name, args: [opts] });
          this.list = async () => [[]];
        }
      };
    }
    const fakeComputeModule = {
      InstancesClient: makeCtorClass('InstancesClient'),
      DisksClient: makeCtorClass('DisksClient'),
      NetworksClient: makeCtorClass('NetworksClient'),
      SubnetworksClient: makeCtorClass('SubnetworksClient'),
      FirewallsClient: makeCtorClass('FirewallsClient'),
    };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeComputeModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new ComputeService('proj', ['us-central1'], ['us-central1-a'], '/tmp/key.json');
      const result = await svc.discover();

      expect(result.errors.find((e) => e.code === 'INIT_ERROR')).toBeUndefined();
      expect(ctorCalls.map((c) => c.ctor).sort()).toEqual(
        ['DisksClient', 'FirewallsClient', 'InstancesClient', 'NetworksClient', 'SubnetworksClient'].sort(),
      );
      expect(ctorCalls[0]!.args[0]).toMatchObject({ projectId: 'proj', keyFilename: '/tmp/key.json' });
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });

  it('omits keyFilename when key_file is not supplied', async () => {
    const calls: unknown[] = [];
    function makeCtor(): new (opts: unknown) => { list: () => Promise<[unknown[]]> } {
      return class {
        list: () => Promise<[unknown[]]>;
        constructor(opts: unknown) {
          calls.push(opts);
          this.list = async () => [[]];
        }
      };
    }
    const fakeComputeModule = {
      InstancesClient: makeCtor(),
      DisksClient: makeCtor(),
      NetworksClient: makeCtor(),
      SubnetworksClient: makeCtor(),
      FirewallsClient: makeCtor(),
    };

    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => fakeComputeModule;
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new ComputeService('proj', [], []);
      await svc.discover();
      expect(calls[0]).toEqual({ projectId: 'proj' });
      expect(calls[0]).not.toHaveProperty('keyFilename');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });

  it('caches clients across discover() calls — second discover does not re-import', async () => {
    function makeCtor(): new (opts: unknown) => { list: () => Promise<[unknown[]]> } {
      return class {
        list: () => Promise<[unknown[]]> = async () => [[]];
      };
    }
    const fakeModule = {
      InstancesClient: makeCtor(),
      DisksClient: makeCtor(),
      NetworksClient: makeCtor(),
      SubnetworksClient: makeCtor(),
      FirewallsClient: makeCtor(),
    };

    let importInvocations = 0;
    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          importInvocations++;
          return fakeModule;
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new ComputeService('proj', [], []);
      await svc.discover();
      await svc.discover();
      expect(importInvocations).toBe(1);
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});

describe('ComputeService — init_clients failure path', () => {
  // The SUT loads @google-cloud/compute through `Function('moduleName',
  // 'return import(moduleName)')`. The `Function` constructor builds the
  // import call in a fresh V8 scope that does NOT inherit Vitest's
  // dynamic-import callback — under Vitest the dynamic import always
  // rejects with "A dynamic import callback was not specified". That
  // gives us cheap coverage of every line in init_clients without
  // having to patch `Function`.

  it('returns INIT_ERROR with the friendly install-the-sdk message when the dynamic import fails', async () => {
    const svc = new ComputeService('p', ['us-central1'], ['us-central1-a']);
    const result = await svc.discover();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('INIT_ERROR');
    expect(result.errors[0]!.message).toMatch(/Failed to initialize GCP Compute client/);
  });

  it('still hits the init-failure path when key_file is supplied', async () => {
    const svc = new ComputeService('p', ['us-central1'], ['us-central1-a'], '/tmp/key.json');
    const result = await svc.discover();
    expect(result.errors[0]!.code).toBe('INIT_ERROR');
  });

  it('falls into INIT_ERROR with String(error) when the thrown value is not an Error', async () => {
    // We override init_clients on a subclass to throw a non-Error rejection so the
    // `error instanceof Error ? ... : String(error)` ternary in the catch falls
    // to the `String(error)` branch.
    class WeirdInitCompute extends ComputeService {
      // @ts-expect-error overriding private
      private async init_clients(): Promise<void> {
        // eslint-disable-next-line no-throw-literal
        throw 'plain-string-thrown';
      }
    }
    const svc = new WeirdInitCompute('p', [], []);
    const result = await svc.discover();
    expect(result.errors[0]!.message).toContain('plain-string-thrown');
  });

  it('init_clients catch falls into String(error) when the dynamic import rejects with a non-Error', async () => {
    // Force the inner Function-import to reject with a plain string so the
    // ternary on line 57 takes its String(error) arm. The Error wrapper that
    // re-throws then surfaces a literal "plain-thrown-non-error" suffix in
    // the message.
    const OriginalFunction = globalThis.Function;
    (globalThis as any).Function = function (...args: any[]): any {
      if (args.length === 2 && args[0] === 'moduleName' && args[1] === 'return import(moduleName)') {
        return async (_: string) => {
          // eslint-disable-next-line no-throw-literal
          throw 'plain-thrown-non-error';
        };
      }
      return new (OriginalFunction as any)(...args);
    };
    (globalThis as any).Function.prototype = OriginalFunction.prototype;

    try {
      const svc = new ComputeService('p', [], []);
      const result = await svc.discover();
      expect(result.errors[0]!.message).toContain('plain-thrown-non-error');
    } finally {
      (globalThis as any).Function = OriginalFunction;
    }
  });
});
