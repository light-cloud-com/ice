/**
 * Schema event subscription helpers.
 *
 * Extracted from `EmbeddedSchemaProvider` (rf-esp-4). The event-listener
 * `Map` is owned by the caller (the orchestrator class); these helpers
 * read/write through.
 *
 * Behaviour preserved verbatim:
 *  - on(): lazily creates a Set when the listener slot is empty.
 *  - off(): no-op when no listeners are registered.
 *  - emit_event(): builds the SchemaEvent payload (timestamp, ice_type,
 *    message), invokes each listener, swallows listener errors silently.
 */
import type { IceType, SchemaEvent, SchemaEventListener, SchemaEventType } from '../schema-provider';

export type EventListenerMap = Map<SchemaEventType, Set<SchemaEventListener>>;

export function add_listener(
  listeners_map: EventListenerMap,
  event: SchemaEventType,
  listener: SchemaEventListener,
): void {
  let listeners = listeners_map.get(event);
  if (!listeners) {
    listeners = new Set();
    listeners_map.set(event, listeners);
  }
  listeners.add(listener);
}

export function remove_listener(
  listeners_map: EventListenerMap,
  event: SchemaEventType,
  listener: SchemaEventListener,
): void {
  const listeners = listeners_map.get(event);
  if (listeners) {
    listeners.delete(listener);
  }
}

export function emit_event(
  listeners_map: EventListenerMap,
  type: SchemaEventType,
  ice_type?: IceType,
  message?: string,
): void {
  const listeners = listeners_map.get(type);
  if (listeners) {
    const event: SchemaEvent = {
      type,
      timestamp: new Date().toISOString(),
      ice_type,
      message,
    };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
