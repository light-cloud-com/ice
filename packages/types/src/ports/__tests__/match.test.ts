import { describe, expect, it } from 'vitest';
import { canPortsConnect, rolesCompatible, findMatchingPorts, chooseBestTargetPort } from '../match';
import type { PortDef } from '../types';

function port(over: Partial<PortDef>): PortDef {
  return {
    id: 'p',
    direction: 'out',
    role: 'database',
    label: '',
    side: 'right',
    shape: 'circle',
    ...over,
  };
}

describe('rolesCompatible', () => {
  it('matches identical roles', () => {
    expect(rolesCompatible('domain', 'domain')).toBe(true);
    expect(rolesCompatible('database', 'database')).toBe(true);
  });

  it('rejects different roles', () => {
    expect(rolesCompatible('domain', 'repository')).toBe(false);
    expect(rolesCompatible('database', 'cache')).toBe(false);
  });

  it("'any' is the reroute passthrough — matches everything", () => {
    expect(rolesCompatible('any', 'database')).toBe(true);
    expect(rolesCompatible('domain', 'any')).toBe(true);
    expect(rolesCompatible('any', 'any')).toBe(true);
  });
});

describe('canPortsConnect', () => {
  it('two out ports never connect', () => {
    const a = port({ direction: 'out', role: 'database' });
    const b = port({ direction: 'out', role: 'database' });
    expect(canPortsConnect(a, b)).toBe(false);
  });

  it('two in ports never connect', () => {
    const a = port({ direction: 'in', role: 'database' });
    const b = port({ direction: 'in', role: 'database' });
    expect(canPortsConnect(a, b)).toBe(false);
  });

  it('out + matching in → true', () => {
    const out = port({ direction: 'out', role: 'database' });
    const inn = port({ direction: 'in', role: 'database' });
    expect(canPortsConnect(out, inn)).toBe(true);
  });

  it('out + mismatched in → false', () => {
    const out = port({ direction: 'out', role: 'database' });
    const inn = port({ direction: 'in', role: 'cache' });
    expect(canPortsConnect(out, inn)).toBe(false);
  });

  it('any-role port connects to any other direction', () => {
    const a = port({ direction: 'out', role: 'any' });
    const b = port({ direction: 'in', role: 'database' });
    expect(canPortsConnect(a, b)).toBe(true);
  });
});

describe('canPortsConnect — peer-kind cross-check (queue + similar)', () => {
  it("Backend.queue-out (publish, peerKind='queue') does NOT connect to another Backend.queue-in (subscribe, peerKind='queue')", () => {
    // Both ports declare peerKind='queue'; both blocks are kind='service'.
    // The pre-existing role-identity match would pass — peer-kind is what
    // blocks the wrong wiring.
    const backendPublishOut = port({
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      peerKind: 'queue',
    });
    const backendSubscribeIn = port({
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      peerKind: 'queue',
    });
    expect(canPortsConnect(backendPublishOut, backendSubscribeIn, 'service', 'service')).toBe(false);
  });

  it("Backend.queue-out (peerKind='queue') connects to a real Queue.queue-in (peerKind='service')", () => {
    const backendPublishOut = port({
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      peerKind: 'queue',
    });
    const queueIn = port({
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      peerKind: 'service',
    });
    expect(canPortsConnect(backendPublishOut, queueIn, 'service', 'queue')).toBe(true);
  });

  it("Queue.queue-out (peerKind='service') connects to a Backend.queue-in (peerKind='queue')", () => {
    const queueOut = port({
      id: 'queue-out',
      direction: 'out',
      role: 'queue',
      peerKind: 'service',
    });
    const backendSubscribeIn = port({
      id: 'queue-in',
      direction: 'in',
      role: 'queue',
      peerKind: 'queue',
    });
    expect(canPortsConnect(queueOut, backendSubscribeIn, 'queue', 'service')).toBe(true);
  });

  it('peer-kind is permissive when kinds are not provided (backward compat)', () => {
    const a = port({ direction: 'out', role: 'queue', peerKind: 'queue' });
    const b = port({ direction: 'in', role: 'queue', peerKind: 'queue' });
    // Callers without iceType context — the model degrades to role-only.
    expect(canPortsConnect(a, b)).toBe(true);
  });

  it('reroute kind is universally acceptable on either side', () => {
    const out = port({ direction: 'out', role: 'any', peerKind: 'any' });
    const in_ = port({ direction: 'in', role: 'database', peerKind: 'database' });
    expect(canPortsConnect(out, in_, 'reroute', 'database')).toBe(true);
  });

  it('blocks the partner when our peer-kind disagrees with their block kind', () => {
    const a = port({ direction: 'out', role: 'repository', peerKind: 'service' });
    const b = port({ direction: 'in', role: 'repository', peerKind: 'repository' });
    expect(canPortsConnect(a, b, 'repository', 'queue')).toBe(false);
  });
});

describe('findMatchingPorts', () => {
  it('returns all candidates matching the source role + opposite direction', () => {
    const src = port({ direction: 'out', role: 'database' });
    const candidates = [
      port({ direction: 'in', role: 'database', id: 'db-in' }),
      port({ direction: 'in', role: 'cache', id: 'cache-in' }),
      port({ direction: 'out', role: 'database', id: 'wrong-direction' }),
      port({ direction: 'in', role: 'any', id: 'any-in' }),
    ];
    const ids = findMatchingPorts(src, candidates).map((p) => p.id);
    expect(ids).toEqual(['db-in', 'any-in']);
  });
});

describe('chooseBestTargetPort', () => {
  it('prefers exact-role IN over any-role IN', () => {
    const src = port({ direction: 'out', role: 'database' });
    const candidates = [
      port({ direction: 'in', role: 'any', id: 'any-in' }),
      port({ direction: 'in', role: 'database', id: 'db-in' }),
    ];
    expect(chooseBestTargetPort(src, candidates)?.id).toBe('db-in');
  });

  it('falls back to any-role when no exact match exists', () => {
    const src = port({ direction: 'out', role: 'database' });
    const candidates = [port({ direction: 'in', role: 'any', id: 'any-in' })];
    expect(chooseBestTargetPort(src, candidates)?.id).toBe('any-in');
  });

  it('returns undefined when no compatible IN port exists', () => {
    const src = port({ direction: 'out', role: 'database' });
    const candidates = [port({ direction: 'in', role: 'cache', id: 'cache-in' })];
    expect(chooseBestTargetPort(src, candidates)).toBeUndefined();
  });

  it('reverses when source is an IN port (drag started from an input)', () => {
    const src = port({ direction: 'in', role: 'database' });
    const candidates = [
      port({ direction: 'out', role: 'cache', id: 'cache-out' }),
      port({ direction: 'out', role: 'database', id: 'db-out' }),
    ];
    expect(chooseBestTargetPort(src, candidates)?.id).toBe('db-out');
  });
});
