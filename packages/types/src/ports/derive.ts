/**
 * Port derivation — produces the ordered port list for a node.
 *
 * Replaces `getSocketsForNode` from the prior abstract-socket model.
 * The new model is fully schema-driven: each iceType has a hand-authored
 * `PortSchema` (in `./schemas/`) that declares ports anchored to the
 * block's typed properties. Property changes still reshape sockets at
 * render time — `dynamic(data)` lets a multi-port block emit one port
 * per item in `node.data.exposed_ports`, and `hide` lets a schema drop
 * a base port when a property predicate fires.
 */

import { getPortSchema } from './schemas';
import { isContainer } from '../connection-rules/predicates';
import type { PortDef } from './types';
import type { NodeForConnectionCheck } from '../connection-rules/types';

export interface NodeForPorts extends NodeForConnectionCheck {
  data?: Record<string, unknown>;
}

const cache = new Map<string, PortDef[]>();

/** Test helper — clears the memo cache. */
export function _resetPortCache(): void {
  cache.clear();
}

function cacheKey(iceType: string, data: Record<string, unknown>): string {
  const schema = getPortSchema(iceType);
  if (!schema) return iceType;
  const keys = new Set<string>();
  for (const h of schema.hide ?? []) h.keys.forEach((k) => keys.add(k));
  // `dynamic` reads `node.data` opaquely — if a schema declares one, key
  // on a structural hash of the data object to be safe. (Practically
  // only `exposed_ports` triggers this, so the JSON is small.)
  const parts: string[] = [iceType];
  for (const k of Array.from(keys).sort()) {
    parts.push(`${k}=${JSON.stringify(data[k] ?? null)}`);
  }
  if (schema.dynamic) parts.push(`dyn=${JSON.stringify(data.exposed_ports ?? null)}`);
  return parts.join('|');
}

export function getPortsForNode(node: NodeForPorts): PortDef[] {
  const data = node.data ?? {};
  const iceType = typeof data.iceType === 'string' ? data.iceType : '';
  if (!iceType) return [];
  // Containers (VPC, Subnet, Group.*) never expose ports; children attach via parentId.
  if (isContainer(iceType, node.type)) return [];

  const schema = getPortSchema(iceType);
  if (!schema) return [];

  const key = cacheKey(iceType, data);
  const cached = cache.get(key);
  if (cached) return cached;

  let ports: PortDef[] = [...schema.base];
  if (schema.hide) {
    for (const hide of schema.hide) {
      if (hide.when(data)) {
        const ids = new Set(hide.portIds);
        ports = ports.filter((p) => !ids.has(p.id));
      }
    }
  }
  if (schema.dynamic) {
    ports = ports.concat(schema.dynamic(data));
  }
  // Dedupe by id (later wins).
  const byId = new Map<string, PortDef>();
  for (const p of ports) byId.set(p.id, p);
  const result = Array.from(byId.values());
  cache.set(key, result);
  return result;
}

/** Lookup helper for the render layer. */
export function findPort(node: NodeForPorts, portId: string): PortDef | undefined {
  return getPortsForNode(node).find((p) => p.id === portId);
}

/** Used by `svg-connection-path.tsx` to detect dangling edges (socket removed). */
export function hasPort(node: NodeForPorts, portId: string): boolean {
  return getPortsForNode(node).some((p) => p.id === portId);
}
