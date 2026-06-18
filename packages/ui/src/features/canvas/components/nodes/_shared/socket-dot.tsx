/**
 * SocketDot — the single source of truth for what a typed port looks
 * like on the canvas.
 *
 * Every block renders sockets through this component: the schema-driven
 * `TypedSockets` layer (for blocks that use the standard side-distributed
 * port layout) AND any bespoke renderer that needs custom positioning
 * (e.g. `Network.CustomDomain` rows). Centralising the visual logic
 * here means shape, color, halos, drag-context highlighting, and data
 * attributes all stay consistent — fix the dot once and every block gets
 * the fix.
 *
 * The dot's drag-aware `state` controls sizing + halo:
 *
 *   - `idle`           — resting state, no drag in progress (or this port
 *                        isn't a candidate target).
 *   - `compatible`     — a drag is in progress from elsewhere and this
 *                        port accepts the source's role.
 *   - `snapped`        — the magnet has locked the wire endpoint onto
 *                        this exact port.
 *   - `incompatible`   — drag in progress but this port doesn't accept
 *                        the source's role.
 *   - `source-active`  — this port IS the source of the current drag.
 *
 * The dot's shape is driven by `PortDef.shape` so a Repository socket
 * (diamond) and a Domain socket (square) read as different things at
 * a glance.
 */

import { CATEGORY_COLORS, type ConnectionCategory } from '@ice/constants';
import { ROLE_CATEGORY, type PortDef } from '@ice/types';
import React from 'react';
import { CATEGORY_STYLE } from '../../../../../config/canvas-constants';
import { prefersReducedMotion } from '../../../../../shared/hooks/use-reduced-motion';

export type DotState = 'idle' | 'compatible' | 'snapped' | 'incompatible' | 'source-active';

/** Default visible radius (resting state). Other states scale relative to this. */
export const SHAPE_RADIUS = 6;

export interface SocketDotProps {
  socketId: string;
  nodeId: string;
  /** Anchor side (left/right/top/bottom). Stored on the DOM attr — used by drag handlers. */
  side: string;
  /** Port role (domain/database/repository/queue/…). */
  role: PortDef['role'];
  /** Visual shape (circle/ring/diamond/square). */
  shape: PortDef['shape'];
  direction: 'in' | 'out';
  /** Human-readable label (used in the hover tooltip + a11y `<title>`). */
  label: string;
  /** Peer block category key for color resolution via CATEGORY_STYLE. */
  peerStyle?: string;
  /** Canvas-space center of the dot. */
  cx: number;
  cy: number;
  /** Master opacity (CardShell dims to ~0.35 at idle, full on hover/selection). */
  opacity?: number;
  /** Legacy drag-target glow (block-level) — true → green fill + slightly larger radius. */
  isValidTarget?: boolean;
  /** Drag-aware per-port state. Defaults to `idle`. */
  state?: DotState;
  /** Extra DOM attributes (e.g. `data-route-id` for Custom Domain per-route ports). */
  extraAttrs?: Record<string, string>;
}

/**
 * Pick the dot color: peer block's category accent (so a frontend's
 * domain-in reads as Custom Domain's rose) → fall back to abstract
 * category color via `ROLE_CATEGORY`.
 */
export function socketColor(role: PortDef['role'], peerStyle?: string): string {
  if (peerStyle) {
    const style = CATEGORY_STYLE[peerStyle];
    if (style?.glow) return style.glow;
  }
  return CATEGORY_COLORS[ROLE_CATEGORY[role]];
}

export const SocketDot: React.FC<SocketDotProps> = ({
  socketId,
  nodeId,
  side,
  role,
  direction,
  shape,
  label,
  peerStyle,
  cx,
  cy,
  opacity,
  isValidTarget = false,
  state = 'idle',
  extraAttrs,
}) => {
  const category: ConnectionCategory = ROLE_CATEGORY[role];
  const color = socketColor(role, peerStyle);
  // AX4 — SMIL `<animate>` ignores the CSS `prefers-reduced-motion` net, so the
  // pulsing halo is gated here. One-shot read (no hook) keeps SocketDot pure.
  const reducedMotion = prefersReducedMotion();

  // Drag-aware sizing — compatible ports grow to invite, snapped grows
  // most + pulses, incompatible shrinks slightly.
  const r =
    state === 'snapped'
      ? SHAPE_RADIUS + 3
      : state === 'source-active'
        ? SHAPE_RADIUS + 2
        : state === 'compatible'
          ? SHAPE_RADIUS + 1
          : state === 'incompatible'
            ? SHAPE_RADIUS - 1
            : isValidTarget
              ? SHAPE_RADIUS + 1
              : SHAPE_RADIUS;

  const fill = state === 'snapped' ? '#22c55e' : isValidTarget ? '#22c55e' : color;
  const stroke = 'var(--ice-bg-base)';
  const strokeWidth = 2;

  // Standard data attributes — every consumer agrees on the shape.
  const common: Record<string, unknown> = {
    className: 'connection-port',
    'data-node-id': nodeId,
    'data-socket-id': socketId,
    'data-side': side,
    'data-category': category,
    'data-port-role': role,
    'data-direction': direction,
    'data-socket-label': label,
    ...(peerStyle && { 'data-peer-style': peerStyle }),
    ...extraAttrs,
    style: { cursor: 'crosshair' },
    ...(typeof opacity === 'number' ? { opacity } : {}),
  };

  // Native SVG <title> stays as the a11y fallback alongside the canvas-
  // level hover-tooltip overlay (which reads `data-socket-label`).
  const titleEl = <title>{`${label} · ${category}/${direction}`}</title>;

  // Compatible / source-active halo — green ring outside the dot so
  // "wire can land here" / "drag started from here" reads immediately.
  // Brighter + pulsing when snapped.
  const haloRadius = r + 5;
  const haloOpacity = state === 'snapped' ? 0.95 : state === 'source-active' ? 0.75 : state === 'compatible' ? 0.45 : 0;
  const haloColor = state === 'source-active' ? color : '#22c55e';
  const halo =
    haloOpacity > 0 ? (
      <circle
        cx={cx}
        cy={cy}
        r={haloRadius}
        fill="none"
        stroke={haloColor}
        strokeWidth={state === 'snapped' || state === 'source-active' ? 2 : 1.5}
        opacity={haloOpacity}
        pointerEvents="none"
      >
        {(state === 'snapped' || state === 'source-active') && !reducedMotion && (
          <animate
            attributeName="r"
            values={`${haloRadius};${haloRadius + 2};${haloRadius}`}
            dur={state === 'snapped' ? '1s' : '1.4s'}
            repeatCount="indefinite"
          />
        )}
      </circle>
    ) : null;

  let dot: React.ReactNode;
  switch (shape) {
    case 'ring':
      dot = (
        <circle {...common} cx={cx} cy={cy} r={r} fill="var(--ice-bg-raised)" stroke={fill} strokeWidth={2.5}>
          {titleEl}
        </circle>
      );
      break;
    case 'diamond':
      dot = (
        <rect
          {...common}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          rx={1}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          transform={`rotate(45 ${cx} ${cy})`}
        >
          {titleEl}
        </rect>
      );
      break;
    case 'square':
      dot = (
        <rect
          {...common}
          x={cx - r}
          y={cy - r}
          width={r * 2}
          height={r * 2}
          rx={1.5}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        >
          {titleEl}
        </rect>
      );
      break;
    case 'circle':
    default:
      dot = (
        <circle {...common} cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth}>
          {titleEl}
        </circle>
      );
      break;
  }
  return (
    <g>
      {halo}
      {dot}
    </g>
  );
};

SocketDot.displayName = 'SocketDot';
