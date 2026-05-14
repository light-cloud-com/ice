/**
 * Tests for BaseGCPService — the protected helpers used by every
 * concrete service. Exercised through a thin TestService subclass so
 * we don't need to instantiate any of the SDK-backed services.
 */

import { describe, it, expect } from 'vitest';
import { BaseGCPService } from '../base-service';
import type { ServiceDiscoveryResult, GCPServiceType } from '../../types';

class TestService extends BaseGCPService {
  get service_type(): GCPServiceType {
    return 'compute';
  }
  async discover(): Promise<ServiceDiscoveryResult> {
    return this.create_empty_result();
  }
  // Expose protected helpers for testing
  public _create_resource(...args: Parameters<BaseGCPService['create_resource']>) {
    // @ts-expect-error access protected
    return this.create_resource(...args);
  }
  public _create_error(...args: Parameters<BaseGCPService['create_error']>) {
    // @ts-expect-error access protected
    return this.create_error(...args);
  }
  public _create_warning(...args: Parameters<BaseGCPService['create_warning']>) {
    // @ts-expect-error access protected
    return this.create_warning(...args);
  }
  public _create_empty_result() {
    // @ts-expect-error access protected
    return this.create_empty_result();
  }
}

describe('BaseGCPService.create_resource', () => {
  const svc = new TestService('proj', ['us-central1'], ['us-central1-a']);

  it('builds a resource with selfLink and labels carried through', () => {
    const r = svc._create_resource(
      {
        selfLink: 'https://x/sl',
        name: 'n1',
        id: '42',
        labels: { env: 'prod' },
        creationTimestamp: '2024-01-01',
      },
      'compute#instance',
      'us-central1-a',
    );
    expect(r).toEqual({
      self_link: 'https://x/sl',
      name: 'n1',
      id: '42',
      kind: 'compute#instance',
      zone: 'us-central1-a',
      region: undefined,
      project: 'proj',
      properties: {
        selfLink: 'https://x/sl',
        name: 'n1',
        id: '42',
        labels: { env: 'prod' },
        creationTimestamp: '2024-01-01',
      },
      labels: { env: 'prod' },
      creation_timestamp: '2024-01-01',
    });
  });

  it('uses name as fallback id when id is missing, and empty strings for missing selfLink/name', () => {
    const r = svc._create_resource({ name: 'fallback' }, 'compute#disk', undefined, 'us-central1');
    expect(r.id).toBe('fallback');
    expect(r.self_link).toBe('');
    expect(r.region).toBe('us-central1');
    expect(r.zone).toBeUndefined();
    expect(r.labels).toBeUndefined();
  });

  it('produces empty strings + undefined when neither id nor name is present', () => {
    const r = svc._create_resource({}, 'compute#network');
    expect(r.id).toBe('');
    expect(r.name).toBe('');
    expect(r.self_link).toBe('');
  });
});

describe('BaseGCPService.create_error / create_warning', () => {
  const svc = new TestService('p', [], []);

  it('create_error includes the service type and optional resource', () => {
    expect(svc._create_error('CODE', 'msg', 'res-1')).toEqual({
      code: 'CODE',
      message: 'msg',
      service: 'compute',
      resource: 'res-1',
    });
  });

  it('create_error omits the resource field when not supplied', () => {
    const e = svc._create_error('CODE', 'msg');
    expect(e.resource).toBeUndefined();
  });

  it('create_warning shape matches create_error shape', () => {
    expect(svc._create_warning('CODE', 'msg', 'res-1')).toEqual({
      code: 'CODE',
      message: 'msg',
      service: 'compute',
      resource: 'res-1',
    });
  });
});

describe('BaseGCPService.create_empty_result', () => {
  const svc = new TestService('p', [], []);
  it('returns the empty service result for the concrete service type', () => {
    expect(svc._create_empty_result()).toEqual({
      service: 'compute',
      resources: [],
      errors: [],
      warnings: [],
    });
  });
});
