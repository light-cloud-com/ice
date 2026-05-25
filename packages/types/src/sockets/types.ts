/**
 * Socket type surface.
 *
 * A `SocketDef` describes one typed connection point on a block — what
 * category of wire it carries (TRAFFIC / PIPELINE / CONFIG / DNS), which
 * way wires flow (in / out), and where on the block surface it lives by
 * default. The actual wire-attach point is allowed to slide along the
 * `side` perimeter at render time ("magnetic" routing), but the visible
 * socket dot stays anchored where this type says it does.
 *
 * Inputs default to the left, outputs to the right — Blender Geometry
 * Nodes convention. Schemas may override `side` for blocks where a
 * different anchor reads more naturally (e.g. a top-anchored DNS input
 * on a frontend block).
 */

import type { ConnectionCategory } from '@ice/constants';

/** Side of the block where this socket's dot is anchored. */
export type SocketSide = 'left' | 'right' | 'top' | 'bottom';

/** Direction of data flow through the socket. */
export type SocketDirection = 'in' | 'out';

/**
 * Visual shape of the socket dot. One shape per category so the canvas
 * reads at a glance:
 *   - circle   → traffic
 *   - ring     → config
 *   - diamond  → pipeline
 *   - square   → dns
 */
export type SocketShape = 'circle' | 'ring' | 'diamond' | 'square';

export interface SocketDef {
  /** Stable identifier, persisted on `CardEdge.data.sourceSocket` / `targetSocket`. */
  id: string;
  /** Default anchor side. Render layer may slide the actual attach point along this side. */
  side: SocketSide;
  /** Wire category — drives color via `CATEGORY_COLORS` + connection-rule match. */
  category: ConnectionCategory;
  /** in = receives wires; out = emits wires. */
  direction: SocketDirection;
  /** Tooltip / accessibility label. */
  label: string;
  /** Visual shape; usually derived from category but overridable. */
  shape: SocketShape;
  /** True if this socket accepts more than one edge. Default: false (single). */
  multi?: boolean;
  /**
   * Override the socket dot's color with the peer block's category
   * accent. Set to a CATEGORY_STYLE key like `'Network'`, `'Source'`,
   * `'Config'` so a frontend's dns-in reads as "Custom Domain" (rose)
   * instead of the abstract DNS color (cyan). Falls back to
   * `CATEGORY_COLORS[category]` when unset.
   */
  peerStyle?: string;
  /**
   * Optional peer block iceType for tooltip / discovery — "this socket
   * connects to a Custom Domain." Not load-bearing for routing; purely
   * for the hover chip and future affordances.
   */
  peerIceType?: string;
}

/** Default shape per category. */
export const CATEGORY_SHAPE: Record<ConnectionCategory, SocketShape> = {
  traffic: 'circle',
  pipeline: 'diamond',
  config: 'ring',
  dns: 'square',
};

/** Default anchor side per direction. */
export const DEFAULT_SIDE: Record<SocketDirection, SocketSide> = {
  in: 'left',
  out: 'right',
};
