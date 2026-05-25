/**
 * Socket derivation.
 *
 * `getSocketsForNode(node)` produces the typed socket list for a block,
 * combining (1) the default sockets derived from `CONNECTION_RULES`
 * with (2) any per-block `SocketSchema` adjustments (additions via
 * `base` / `conditional`, removals via `hide`).
 *
 * Socket geometry tracks block properties — toggling `data.replication`
 * on Postgres adds or removes the `replica-out` socket on the next
 * render. Edges already attached to a socket that's no longer present
 * are not auto-deleted; they enter the "dangling" state for the user
 * to clean up explicitly.
 *
 * Containers (VPC, Subnet, Group, PrivateNetwork) emit zero sockets —
 * children attach via `parentId`, not via wires.
 */

import { getSchema } from './schemas';
import { CATEGORY_SHAPE, DEFAULT_SIDE, type SocketDef } from './types';
import { isContainer } from '../connection-rules/predicates';
import { CONNECTION_RULES } from '../connection-rules/rules-data';
import type { SocketSchema } from './socket-schema';
import type { NodeForConnectionCheck } from '../connection-rules/types';
import type { ConnectionCategory } from '@ice/constants';

/** Identifier for a default-derived socket: `<category>-<direction>`. */
function defaultSocketId(category: ConnectionCategory, direction: 'in' | 'out'): string {
  return `${category}-${direction}`;
}

function defaultLabel(category: ConnectionCategory, direction: 'in' | 'out'): string {
  const dir = direction === 'in' ? 'input' : 'output';
  return `${category.charAt(0).toUpperCase()}${category.slice(1)} ${dir}`;
}

/**
 * Peer-block-category accent for a default-derived socket, so the dot
 * reads as "the thing on the other end" rather than the abstract wire
 * category. Per the user's request: a Frontend's dns-in socket should
 * be the Custom Domain (Network) color, not the generic DNS color.
 *
 * Only the unambiguous cases are mapped — TRAFFIC (which can connect
 * to many block types depending on direction and source) stays on the
 * abstract category color.
 */
function defaultPeerStyle(category: ConnectionCategory, direction: 'in' | 'out'): string | undefined {
  // DNS edges are always Custom Domain ↔ Routable. From a Routable's
  // perspective the peer is a Domain (Network family).
  if (category === 'dns' && direction === 'in') return 'Network';
  // PIPELINE edges are always Repo → Service. From a Service the peer
  // is a Source.Repository.
  if (category === 'pipeline' && direction === 'in') return 'Source';
  // CONFIG edges are always Service → EnvConfig/Secrets. From a Service
  // the peer is a Config block.
  if (category === 'config' && direction === 'out') return 'Config';
  return undefined;
}

/**
 * Walk `CONNECTION_RULES` and emit one socket per matching
 * (direction, category) pair. Reverse rules are skipped — they're a
 * drag-direction convenience, not a separate socket. Deduped by id.
 */
function deriveDefaultSockets(iceType: string): SocketDef[] {
  const seen = new Set<string>();
  const out: SocketDef[] = [];
  for (const rule of CONNECTION_RULES) {
    if (rule.reverse) continue;
    if (rule.source(iceType)) {
      const id = defaultSocketId(rule.category, 'out');
      if (!seen.has(id)) {
        seen.add(id);
        const peerStyle = defaultPeerStyle(rule.category, 'out');
        out.push({
          id,
          side: DEFAULT_SIDE.out,
          category: rule.category,
          direction: 'out',
          label: defaultLabel(rule.category, 'out'),
          shape: CATEGORY_SHAPE[rule.category],
          multi: true,
          ...(peerStyle && { peerStyle }),
        });
      }
    }
    if (rule.target(iceType)) {
      const id = defaultSocketId(rule.category, 'in');
      if (!seen.has(id)) {
        seen.add(id);
        const peerStyle = defaultPeerStyle(rule.category, 'in');
        out.push({
          id,
          side: DEFAULT_SIDE.in,
          category: rule.category,
          direction: 'in',
          label: defaultLabel(rule.category, 'in'),
          shape: CATEGORY_SHAPE[rule.category],
          multi: rule.category !== 'config',
          ...(peerStyle && { peerStyle }),
        });
      }
    }
  }
  return out;
}

function applySchema(
  sockets: SocketDef[],
  schema: SocketSchema | undefined,
  data: Record<string, unknown>,
): SocketDef[] {
  if (!schema) return sockets;
  let result = schema.replaceBase ? [] : [...sockets];
  if (schema.base?.length) result.push(...schema.base);
  if (schema.conditional) {
    for (const cond of schema.conditional) {
      if (cond.when(data)) result.push(...cond.sockets);
    }
  }
  if (schema.hide) {
    for (const hide of schema.hide) {
      if (hide.when(data)) {
        const ids = new Set(hide.socketIds);
        result = result.filter((s) => !ids.has(s.id));
      }
    }
  }
  // Final dedupe by id (later wins on conflict).
  const byId = new Map<string, SocketDef>();
  for (const s of result) byId.set(s.id, s);
  return Array.from(byId.values());
}

// ─── Memoization ────────────────────────────────────────────────────────────

/**
 * Memo cache keyed by (iceType, comma-joined values of the keys read by
 * any conditional/hide in the schema). For blocks with no schema, the
 * cache key is just the iceType — they have no property-dependent
 * branches.
 */
const cache = new Map<string, SocketDef[]>();

function cacheKey(iceType: string, schema: SocketSchema | undefined, data: Record<string, unknown>): string {
  if (!schema) return iceType;
  const keys = new Set<string>();
  for (const c of schema.conditional ?? []) c.keys.forEach((k) => keys.add(k));
  for (const h of schema.hide ?? []) h.keys.forEach((k) => keys.add(k));
  const parts: string[] = [iceType];
  for (const k of Array.from(keys).sort()) {
    parts.push(`${k}=${JSON.stringify(data[k] ?? null)}`);
  }
  return parts.join('|');
}

/** Test helper — clears the memo cache. Don't use in production code paths. */
export function _resetSocketCache(): void {
  cache.clear();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * The minimal node shape needed for socket derivation: an iceType
 * (or container `type`) and the property bag.
 */
export interface NodeForSockets extends NodeForConnectionCheck {
  data?: Record<string, unknown>;
}

/**
 * Returns the ordered socket list for a node. Empty for containers,
 * for nodes without an iceType, and for nodes whose iceType doesn't
 * appear as either source or target in any `CONNECTION_RULES` entry.
 */
export function getSocketsForNode(node: NodeForSockets): SocketDef[] {
  const data = node.data ?? {};
  const iceType = typeof data.iceType === 'string' ? data.iceType : '';
  if (!iceType) return [];
  if (isContainer(iceType, node.type)) return [];

  const schema = getSchema(iceType);
  const key = cacheKey(iceType, schema, data);
  const cached = cache.get(key);
  if (cached) return cached;

  const defaults = deriveDefaultSockets(iceType);
  const result = applySchema(defaults, schema, data);
  cache.set(key, result);
  return result;
}

/**
 * Returns true if `socketId` exists on the node's current socket list.
 * Wire-rendering uses this to flag dangling edges whose anchor socket
 * has been removed by a property change.
 */
export function hasSocket(node: NodeForSockets, socketId: string): boolean {
  return getSocketsForNode(node).some((s) => s.id === socketId);
}

/** Lookup helper for the render layer. */
export function findSocket(node: NodeForSockets, socketId: string): SocketDef | undefined {
  return getSocketsForNode(node).find((s) => s.id === socketId);
}
