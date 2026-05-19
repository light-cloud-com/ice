/**
 * Tests for `embedded/events.ts` (rf-esp-4).
 *
 * Behaviour pinned (preserved from pre-extraction event methods of
 * `EmbeddedSchemaProvider`):
 *  - add_listener: lazily creates a Set when slot is empty.
 *  - remove_listener: no-op when no listeners are registered.
 *  - emit_event: builds event with type, ISO timestamp, ice_type, message;
 *    swallows listener errors silently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { add_listener, emit_event, remove_listener, type EventListenerMap } from '../embedded/events';
import type { IceType, SchemaEvent } from '../schema-provider';

describe('add_listener', () => {
  it('lazily creates a Set when slot is empty', () => {
    const map: EventListenerMap = new Map();
    const fn = vi.fn();
    add_listener(map, 'initialized', fn);
    expect(map.get('initialized')?.has(fn)).toBe(true);
  });

  it('appends to an existing Set', () => {
    const map: EventListenerMap = new Map();
    const a = vi.fn();
    const b = vi.fn();
    add_listener(map, 'initialized', a);
    add_listener(map, 'initialized', b);
    expect(map.get('initialized')?.size).toBe(2);
  });

  it('add same listener twice is deduped (Set semantics)', () => {
    const map: EventListenerMap = new Map();
    const fn = vi.fn();
    add_listener(map, 'initialized', fn);
    add_listener(map, 'initialized', fn);
    expect(map.get('initialized')?.size).toBe(1);
  });
});

describe('remove_listener', () => {
  it('removes a registered listener', () => {
    const map: EventListenerMap = new Map();
    const fn = vi.fn();
    add_listener(map, 'initialized', fn);
    remove_listener(map, 'initialized', fn);
    expect(map.get('initialized')?.has(fn)).toBe(false);
  });

  it('is a no-op when there are no listeners', () => {
    const map: EventListenerMap = new Map();
    expect(() => remove_listener(map, 'initialized', vi.fn())).not.toThrow();
  });
});

describe('emit_event', () => {
  let map: EventListenerMap;
  beforeEach(() => {
    map = new Map();
  });

  it('does nothing when no listeners are registered', () => {
    expect(() => emit_event(map, 'initialized')).not.toThrow();
  });

  it('invokes each listener with the event object', () => {
    const a = vi.fn();
    const b = vi.fn();
    add_listener(map, 'initialized', a);
    add_listener(map, 'initialized', b);
    emit_event(map, 'initialized', 'aws.ec2.instance' as IceType, 'ready');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    const evt = a.mock.calls[0]?.[0] as SchemaEvent;
    expect(evt.type).toBe('initialized');
    expect(evt.ice_type).toBe('aws.ec2.instance');
    expect(evt.message).toBe('ready');
    expect(typeof evt.timestamp).toBe('string');
    // ISO format quick sanity check
    expect(new Date(evt.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('omitted ice_type / message remain undefined on the event', () => {
    const fn = vi.fn();
    add_listener(map, 'initialized', fn);
    emit_event(map, 'initialized');
    const evt = fn.mock.calls[0]?.[0] as SchemaEvent;
    expect(evt.ice_type).toBeUndefined();
    expect(evt.message).toBeUndefined();
  });

  it('swallows listener errors silently and continues to subsequent listeners', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const next = vi.fn();
    add_listener(map, 'initialized', thrower);
    add_listener(map, 'initialized', next);
    expect(() => emit_event(map, 'initialized')).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('only listeners for the matching event type are invoked', () => {
    const init_listener = vi.fn();
    const error_listener = vi.fn();
    add_listener(map, 'initialized', init_listener);
    add_listener(map, 'error', error_listener);
    emit_event(map, 'initialized');
    expect(init_listener).toHaveBeenCalledTimes(1);
    expect(error_listener).not.toHaveBeenCalled();
  });
});
