/**
 * Unit tests for `services/deploy/src/services/log-stream/entry-mapping.ts`.
 *
 * Pure-function tests — no Prisma, no SDK, no socket server. Cover the
 * SDK-shape edge cases (protobuf timestamp vs Date vs ISO string,
 * stringly-typed severities, missing data field, JSON payloads),
 * plus the gRPC code 7 / 'PERMISSION_DENIED' classification matrix.
 */

import { describe, it, expect } from 'vitest';
import {
  isPermissionDenied,
  mapEntry,
  mapLevel,
  normalizeTimestamp,
  probeErrorMessage,
} from '../log-stream/entry-mapping';

describe('mapEntry', () => {
  it('maps a typical Cloud Run entry with metadata + string data', () => {
    const result = mapEntry({
      metadata: {
        timestamp: '2026-04-30T10:00:00.000Z',
        insertId: 'i1',
        severity: 'INFO',
        resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
      },
      data: 'hello',
    });
    expect(result).toEqual({
      ts: '2026-04-30T10:00:00.000Z',
      level: 'info',
      message: 'hello',
      resource: { type: 'cloud_run_revision', labels: { service_name: 'api' } },
      insertId: 'i1',
    });
  });

  it('returns null when entry is null', () => {
    expect(mapEntry(null)).toBeNull();
    expect(mapEntry(undefined)).toBeNull();
  });

  it('returns null when timestamp cannot be normalized', () => {
    expect(mapEntry({ metadata: { insertId: 'i1' } })).toBeNull();
  });

  it('returns null when insertId is missing', () => {
    expect(mapEntry({ metadata: { timestamp: '2026-04-30T10:00:00.000Z', insertId: '' } })).toBeNull();
  });

  it('JSON-serializes object payloads', () => {
    const result = mapEntry({
      metadata: { timestamp: '2026-04-30T10:00:00.000Z', insertId: 'i1' },
      data: { foo: 'bar', n: 1 },
    });
    expect(result?.message).toBe('{"foo":"bar","n":1}');
  });

  it('coerces null payload to empty string', () => {
    const result = mapEntry({
      metadata: { timestamp: '2026-04-30T10:00:00.000Z', insertId: 'i1' },
      data: null,
    });
    expect(result?.message).toBe('');
  });

  it('falls back to top-level fields when metadata is absent', () => {
    const result = mapEntry({
      timestamp: '2026-04-30T10:00:00.000Z',
      insertId: 'i1',
      severity: 'WARNING',
      resource: { type: 'gce_instance', labels: { zone: 'us-central1-a' } },
      data: 'x',
    });
    expect(result?.level).toBe('warn');
    expect(result?.resource.type).toBe('gce_instance');
  });

  it('handles JSON.stringify failures by coercing to String()', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    const result = mapEntry({
      metadata: { timestamp: '2026-04-30T10:00:00.000Z', insertId: 'i1' },
      data: cyclic,
    });
    expect(result?.message).toBe('[object Object]');
  });
});

describe('mapLevel', () => {
  it('maps documented severities', () => {
    expect(mapLevel('debug')).toBe('debug');
    expect(mapLevel('info')).toBe('info');
    expect(mapLevel('notice')).toBe('notice');
    expect(mapLevel('warning')).toBe('warn');
    expect(mapLevel('warn')).toBe('warn');
    expect(mapLevel('error')).toBe('error');
    expect(mapLevel('critical')).toBe('error');
    expect(mapLevel('alert')).toBe('error');
    expect(mapLevel('emergency')).toBe('error');
  });

  it('falls back to info for unknown severities', () => {
    expect(mapLevel('verbose')).toBe('info');
    expect(mapLevel('')).toBe('info');
  });
});

describe('normalizeTimestamp', () => {
  it('passes through ISO strings', () => {
    expect(normalizeTimestamp('2026-04-30T10:00:00.000Z')).toBe('2026-04-30T10:00:00.000Z');
  });

  it('serializes Date instances', () => {
    const d = new Date('2026-04-30T10:00:00.000Z');
    expect(normalizeTimestamp(d)).toBe('2026-04-30T10:00:00.000Z');
  });

  it('converts protobuf {seconds, nanos} to ISO', () => {
    const sec = Math.floor(Date.parse('2026-04-30T10:00:00.000Z') / 1000);
    expect(normalizeTimestamp({ seconds: sec, nanos: 0 })).toBe('2026-04-30T10:00:00.000Z');
  });

  it('returns null for unrecognized shapes', () => {
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp(0)).toBeNull();
    expect(normalizeTimestamp({})).toBeNull();
  });
});

describe('isPermissionDenied', () => {
  it('matches numeric gRPC code 7', () => {
    expect(isPermissionDenied({ code: 7 })).toBe(true);
  });

  it('matches string code PERMISSION_DENIED (case-insensitive)', () => {
    expect(isPermissionDenied({ code: 'PERMISSION_DENIED' })).toBe(true);
    expect(isPermissionDenied({ code: 'permission_denied' })).toBe(true);
  });

  it('matches err.status PERMISSION_DENIED', () => {
    expect(isPermissionDenied({ status: 'PERMISSION_DENIED' })).toBe(true);
  });

  it('matches the message-substring fallback', () => {
    expect(isPermissionDenied({ message: 'Caller does not have PERMISSION_DENIED on resource' })).toBe(true);
    expect(isPermissionDenied({ message: 'permission denied' })).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
    expect(isPermissionDenied({ code: 14, message: 'unavailable' })).toBe(false);
    expect(isPermissionDenied({ message: 'rate limited' })).toBe(false);
  });
});

describe('probeErrorMessage', () => {
  it('returns err.message when present', () => {
    expect(probeErrorMessage({ message: 'boom' })).toBe('boom');
  });

  it('returns the documented fallback when err is falsy', () => {
    expect(probeErrorMessage(null)).toBe('Unknown Cloud Logging error.');
    expect(probeErrorMessage(undefined)).toBe('Unknown Cloud Logging error.');
  });

  it('coerces non-Error values via String()', () => {
    expect(probeErrorMessage('plain')).toBe('plain');
    expect(probeErrorMessage({ toString: () => 'custom' })).toBe('custom');
  });
});
