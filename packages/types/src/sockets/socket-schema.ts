/**
 * Socket schema — declarative shape of a block's sockets.
 *
 * Schemas are property-aware: they declare `base` sockets that are always
 * emitted, plus `conditional` and `hide` rules that add or remove sockets
 * based on `node.data` predicates. The point is that **socket geometry
 * tracks block properties**, the way Blender's Mix / Sample Curve nodes
 * grow and shrink their socket lists as the user changes the node's mode.
 *
 * If a block has no schema entry, the derivation falls back to walking
 * `CONNECTION_RULES` and emitting one IN/OUT socket per matching
 * (direction, category) pair — see `derive-sockets.ts`.
 */

import type { SocketDef } from './types';

/**
 * A conditional gate. The `keys` array is load-bearing: it lists the
 * `node.data` keys the `when` predicate reads, which the memoizer uses
 * to build a stable cache key without serializing the whole data object.
 *
 * Adding a new key the predicate reads but forgetting to list it here
 * is a correctness bug — the cache will return stale sockets when that
 * key flips. Add a unit test that toggles the key and asserts the
 * socket list changes.
 */
export interface SocketConditional {
  keys: readonly string[];
  when: (data: Record<string, unknown>) => boolean;
  sockets: SocketDef[];
}

/** Same shape as `SocketConditional` but the gate suppresses sockets by id. */
export interface SocketHide {
  keys: readonly string[];
  when: (data: Record<string, unknown>) => boolean;
  socketIds: readonly string[];
}

export interface SocketSchema {
  iceType: string;
  /**
   * If true, ignore the default `CONNECTION_RULES`-driven derivation and
   * use only `base` + conditionals. Use sparingly — most blocks should
   * augment the defaults, not replace them.
   */
  replaceBase?: boolean;
  /** Always-emitted sockets. Appended to the default derivation when `replaceBase` is false. */
  base?: SocketDef[];
  /** Sockets emitted only when the gate passes. */
  conditional?: SocketConditional[];
  /** Default-derived or base sockets removed when the gate passes. */
  hide?: SocketHide[];
}
