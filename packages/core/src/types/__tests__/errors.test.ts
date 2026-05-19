/**
 * Tests for the ICE error class hierarchy in core/types/errors.ts.
 *
 * Each error class is exercised through its constructor + the
 * common toJSON / toString surface inherited from IceError. The
 * three top-level helpers (is_ice_error, is_retryable, wrap_error)
 * round out the coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  IceError,
  ValidationError,
  GraphError,
  NodeNotFoundError,
  CycleDetectedError,
  ProviderError,
  AuthenticationError,
  RateLimitError,
  DeploymentError,
  SecurityError,
  InternalError,
  NotImplementedError,
  is_ice_error,
  is_retryable,
  wrap_error,
} from '../errors';

describe('IceError shape (via concrete subclass)', () => {
  it('captures name, code, category, status_code, context, cause, and stack', () => {
    const cause = new Error('inner');
    const err = new GraphError('wrapper', 'GRAPH_INVALID', { foo: 1 }, cause);
    expect(err.name).toBe('GraphError');
    expect(err.message).toBe('wrapper');
    expect(err.code).toBe('GRAPH_INVALID');
    expect(err.category).toBe('GRAPH');
    expect(err.status_code).toBe(400);
    expect(err.context).toEqual({ foo: 1 });
    expect(err.cause).toBe(cause);
    expect(err.stack).toBeDefined();
  });

  it('toJSON returns the serialized shape', () => {
    const err = new GraphError('x', 'GRAPH_INVALID', { foo: 1 });
    const j = err.toJSON();
    expect(j.name).toBe('GraphError');
    expect(j.category).toBe('GRAPH');
    expect(j.code).toBe('GRAPH_INVALID');
    expect(j.status_code).toBe(400);
    expect(j.context).toEqual({ foo: 1 });
    expect(j.message).toBe('x');
    // stack is optional but populated under v8.
    expect(j.stack).toBeDefined();
  });

  it('toString returns "[CODE] message"', () => {
    expect(new GraphError('failed', 'GRAPH_INVALID').toString()).toBe('[GRAPH_INVALID] failed');
  });

  it('IceError is abstract — verified via instanceof checks on concrete subclasses', () => {
    expect(new GraphError('x') instanceof IceError).toBe(true);
    expect(new ValidationError('x') instanceof IceError).toBe(true);
  });
});

describe('ValidationError', () => {
  it('defaults code to VALIDATION_FAILED and status to 400', () => {
    const err = new ValidationError('bad');
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.status_code).toBe(400);
    expect(err.violations).toEqual([]);
  });

  it('captures violations and merges them into context', () => {
    const violations = [{ path: 'name', message: 'required', code: 'MISSING_REQUIRED' }];
    const err = new ValidationError('bad', violations, 'MISSING_REQUIRED', { node: 'n1' });
    expect(err.code).toBe('MISSING_REQUIRED');
    expect(err.violations).toBe(violations);
    expect(err.context).toEqual({ violations, node: 'n1' });
  });
});

describe('GraphError + subclasses', () => {
  it('NodeNotFoundError prefixes message with the node id', () => {
    const err = new NodeNotFoundError('node-1', { extra: 'ctx' });
    expect(err.message).toBe('Node not found: node-1');
    expect(err.code).toBe('NODE_NOT_FOUND');
    expect(err.context).toEqual({ node_id: 'node-1', extra: 'ctx' });
  });

  it('CycleDetectedError prints the cycle path', () => {
    const err = new CycleDetectedError(['a', 'b', 'a']);
    expect(err.message).toContain('a -> b -> a');
    expect(err.cycle).toEqual(['a', 'b', 'a']);
    expect(err.code).toBe('CYCLE_DETECTED');
  });
});

describe('ProviderError + subclasses', () => {
  it('captures provider, retryable flag, status_code, and context', () => {
    const err = new ProviderError('boom', 'gcp', 'API_ERROR', 503, true, { call: 'foo' });
    expect(err.provider).toBe('gcp');
    expect(err.retryable).toBe(true);
    expect(err.status_code).toBe(503);
    expect(err.context).toEqual({ provider: 'gcp', call: 'foo' });
  });

  it('AuthenticationError uses status 401 + custom default message', () => {
    const err = new AuthenticationError('aws');
    expect(err.message).toBe('Authentication failed for provider: aws');
    expect(err.code).toBe('PROVIDER_AUTH_FAILED');
    expect(err.status_code).toBe(401);
    expect(err.retryable).toBe(false);
  });

  it('AuthenticationError honors a custom message', () => {
    const err = new AuthenticationError('aws', 'token expired');
    expect(err.message).toBe('token expired');
  });

  it('RateLimitError captures retry_after_ms and is retryable', () => {
    const err = new RateLimitError('gcp', 30000);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status_code).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.retry_after_ms).toBe(30000);
  });

  it('RateLimitError accepts an undefined retry_after_ms', () => {
    const err = new RateLimitError('gcp');
    expect(err.retry_after_ms).toBeUndefined();
  });
});

describe('DeploymentError', () => {
  it('captures affected_nodes', () => {
    const err = new DeploymentError('failed', ['n1', 'n2']);
    expect(err.affected_nodes).toEqual(['n1', 'n2']);
    expect(err.code).toBe('DEPLOYMENT_FAILED');
    expect(err.status_code).toBe(500);
    expect(err.context).toEqual({ affected_nodes: ['n1', 'n2'] });
  });

  it('defaults affected_nodes to []', () => {
    const err = new DeploymentError('failed');
    expect(err.affected_nodes).toEqual([]);
  });
});

describe('SecurityError', () => {
  it('captures policy and merges it into context', () => {
    const err = new SecurityError('denied', 'POLICY_DENIED', 'admin-only');
    expect(err.code).toBe('POLICY_DENIED');
    expect(err.status_code).toBe(403);
    expect(err.policy).toBe('admin-only');
    expect(err.context).toEqual({ policy: 'admin-only' });
  });

  it('policy is optional', () => {
    const err = new SecurityError('denied');
    expect(err.policy).toBeUndefined();
  });
});

describe('InternalError + NotImplementedError', () => {
  it('InternalError defaults code to INTERNAL_ERROR', () => {
    const err = new InternalError('something');
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.category).toBe('INTERNAL');
    expect(err.status_code).toBe(500);
  });

  it('NotImplementedError prefixes with "Feature not implemented"', () => {
    const err = new NotImplementedError('multi-region-deploy');
    expect(err.message).toBe('Feature not implemented: multi-region-deploy');
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(err.context).toEqual({ feature: 'multi-region-deploy' });
  });
});

describe('is_ice_error', () => {
  it('returns true for any IceError subclass', () => {
    expect(is_ice_error(new ValidationError('x'))).toBe(true);
    expect(is_ice_error(new GraphError('x'))).toBe(true);
    expect(is_ice_error(new NotImplementedError('x'))).toBe(true);
  });

  it('returns false for plain Error and non-error values', () => {
    expect(is_ice_error(new Error('x'))).toBe(false);
    expect(is_ice_error('boom')).toBe(false);
    expect(is_ice_error(null)).toBe(false);
    expect(is_ice_error(undefined)).toBe(false);
    expect(is_ice_error({})).toBe(false);
  });
});

describe('is_retryable', () => {
  it('returns true for ProviderError with retryable=true', () => {
    expect(is_retryable(new ProviderError('x', 'gcp', 'API_ERROR', 500, true))).toBe(true);
  });
  it('returns false for ProviderError with retryable=false', () => {
    expect(is_retryable(new ProviderError('x', 'gcp', 'API_ERROR', 500, false))).toBe(false);
  });
  it('returns true for RateLimitError (always)', () => {
    expect(is_retryable(new RateLimitError('gcp'))).toBe(true);
  });
  it('returns false for non-provider errors', () => {
    expect(is_retryable(new GraphError('x'))).toBe(false);
    expect(is_retryable(new Error('x'))).toBe(false);
    expect(is_retryable('not even an error')).toBe(false);
  });
});

describe('wrap_error', () => {
  it('returns the error unchanged if it is already an IceError', () => {
    const e = new GraphError('x');
    expect(wrap_error(e)).toBe(e);
  });

  it('wraps a plain Error in an InternalError', () => {
    const e = new Error('boom');
    const out = wrap_error(e);
    expect(out).toBeInstanceOf(InternalError);
    expect(out.message).toBe('boom');
    expect(out.cause).toBe(e);
  });

  it('uses the supplied message override', () => {
    const out = wrap_error(new Error('inner'), 'outer');
    expect(out.message).toBe('outer');
  });

  it('coerces non-Error values to a string-based Error', () => {
    const out = wrap_error('plain string');
    expect(out).toBeInstanceOf(InternalError);
    expect(out.message).toBe('plain string');
    expect((out.cause as Error).message).toBe('plain string');
  });
});
