/**
 * SvgCustomDomainNode — Custom canvas renderer for `Network.CustomDomain`
 *
 * Unlike other blocks (which all flow through `SvgCompactNode`), the
 * Custom Domain block renders ONE ROW PER ROUTE, with each row carrying
 * its own connection port on the right edge. This lets users wire each
 * subdomain to a different downstream service via a dedicated slot.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────┐
 *   │ 🌐 Custom Domain                 │  ← header
 *   │    example.com                   │
 *   ├──────────────────────────────────┤
 *   │ root  · example.com           ●──┤  ← route row + port
 *   │ app   · app.example.com       ●──┤
 *   │ api   · api.example.com       ●  │
 *   ├──────────────────────────────────┤
 *   │  + Add subdomain route           │
 *   └──────────────────────────────────┘
 *
 * Each port is a `<circle class="connection-port">` with both `data-node-id`
 * AND `data-route-id` attributes. The svg-canvas drag handler reads
 * `data-route-id` from the source port and stores it on the
 * `drawingConnection` state, then sets `edge.data.routeId` when the edge
 * is created. The translator (Pass 1.45 in `card-translator.ts`) looks
 * up the route on the source block by id at deploy time and propagates
 * `<subdomain>.<rootDomain>` onto the connected target's `domain`
 * property.
 *
 * Height is dynamic — `computeCustomDomainHeight()` is exported and
 * called from `svg-canvas.tsx` so the canvas re-measures the node when
 * routes are added/removed.
 */

import { Globe, Plus, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { CARD_WIDTH, CATEGORY_STYLE, CORNER_RADIUS } from '../../../../../config/canvas-constants';
import type { SvgCompactNodeProps } from '../compact-node/types';

// ─── Layout constants ───────────────────────────────────────────────────────
//
// Exported so SvgConnectionPath can compute the exact y-coordinate of
// each route's port when routing edges from this block. Without this,
// edges would attach to the generic right-side midpoint instead of the
// row the user dragged from.

export const CD_HEADER_HEIGHT = 48;
export const CD_DOMAIN_FIELD_HEIGHT = 38;
export const CD_ROUTE_ROW_HEIGHT = 36;
export const CD_ROUTE_ROW_GAP = 4;
export const CD_PADDING = 10;
const ADD_BUTTON_HEIGHT = 32;
const CARD_PX = 12;

const HEADER_HEIGHT = CD_HEADER_HEIGHT;
const DOMAIN_FIELD_HEIGHT = CD_DOMAIN_FIELD_HEIGHT;
const ROUTE_ROW_HEIGHT = CD_ROUTE_ROW_HEIGHT;
const ROUTE_ROW_GAP = CD_ROUTE_ROW_GAP;
const PADDING = CD_PADDING;

/**
 * Compute the absolute y-coordinate (relative to the node's top edge)
 * of a route row's center port. Used by both the renderer (drawing the
 * port circle) AND by `SvgConnectionPath` (anchoring edge start points
 * to the correct row).
 */
export function getCustomDomainRoutePortY(rowIndex: number): number {
  const firstRowTop = CD_HEADER_HEIGHT + CD_DOMAIN_FIELD_HEIGHT + CD_PADDING;
  return firstRowTop + rowIndex * (CD_ROUTE_ROW_HEIGHT + CD_ROUTE_ROW_GAP) + CD_ROUTE_ROW_HEIGHT / 2;
}

interface Route {
  id: string;
  subdomain: string;
}

/**
 * Compute the dynamic height of a Custom Domain node based on its
 * routes count. Called from `svg-canvas.tsx`'s `canvasNodes` useMemo
 * so React re-measures when the user adds/removes a route.
 */
export function computeCustomDomainHeight(data: Record<string, unknown>): number {
  const routes = (data?.routes as Route[] | undefined) || [];
  const routeCount = Math.max(routes.length, 0);
  return (
    HEADER_HEIGHT +
    DOMAIN_FIELD_HEIGHT +
    PADDING +
    routeCount * (ROUTE_ROW_HEIGHT + ROUTE_ROW_GAP) +
    PADDING +
    ADD_BUTTON_HEIGHT +
    PADDING
  );
}

export function computeCustomDomainWidth(): number {
  return CARD_WIDTH + 40; // a bit wider than standard nodes to fit the host preview
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRouteId(): string {
  return `route-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSubdomain(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^https?:\/\//, '');
  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) s = s.slice(0, dotIdx);
  s = s.replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').replace(/-+$/, '');
  if (s.length > 63) s = s.slice(0, 63);
  return s;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SvgCustomDomainNode: React.FC<SvgCompactNodeProps> = ({
  node,
  isSelected,
  isDragOver = false,
  onNodeHover,
  onUpdateData,
  connectionDragState = null,
}) => {
  const { x, y, data, label } = node;
  const W = node.width;
  const H = node.height;
  const [isHovered, setIsHovered] = useState(false);

  // ── Data extraction ──
  const rootDomain = String(data?.domain || '').trim();
  const routes = ((data?.routes as Route[] | undefined) || []).slice();

  const cat = CATEGORY_STYLE.Network || CATEGORY_STYLE.default;
  const categoryGlow = cat.glow;
  const isValidTarget = connectionDragState === 'valid-target';
  const isInvalidTarget = connectionDragState === 'invalid-target';
  const isSource = connectionDragState === 'source';

  const border =
    isDragOver
      ? '#22d3ee'
      : isValidTarget
        ? '#22c55e'
        : isInvalidTarget
          ? '#ef4444'
          : isSelected || isHovered
            ? categoryGlow
            : categoryGlow + '55';

  // ── Mutators ──
  const updateRoutes = useCallback(
    (next: Route[]) => {
      onUpdateData?.(node.id, { routes: next });
    },
    [node.id, onUpdateData],
  );

  const updateDomain = useCallback(
    (value: string) => {
      onUpdateData?.(node.id, { domain: value.toLowerCase().trim() });
    },
    [node.id, onUpdateData],
  );

  const addRoute = useCallback(() => {
    updateRoutes([...routes, { id: makeRouteId(), subdomain: '' }]);
  }, [routes, updateRoutes]);

  const updateRouteSubdomain = useCallback(
    (routeId: string, subdomain: string) => {
      updateRoutes(routes.map((r) => (r.id === routeId ? { ...r, subdomain: normalizeSubdomain(subdomain) } : r)));
    },
    [routes, updateRoutes],
  );

  const deleteRoute = useCallback(
    (routeId: string) => {
      updateRoutes(routes.filter((r) => r.id !== routeId));
    },
    [routes, updateRoutes],
  );

  // ── Layout: route row port positions (relative to node origin) ──
  // Uses the shared `getCustomDomainRoutePortY` helper so the exported
  // y-coordinate matches what `SvgConnectionPath` uses for edge anchoring.
  const portPositions = routes.map((_, i) => ({
    cx: x + W,
    cy: y + getCustomDomainRoutePortY(i),
  }));

  const onEnter = useCallback(() => {
    setIsHovered(true);
    onNodeHover?.(node.id);
  }, [node.id, onNodeHover]);
  const onLeave = useCallback(() => {
    setIsHovered(false);
    onNodeHover?.(null);
  }, [onNodeHover]);

  return (
    <g>
      {/* ── Card body via foreignObject so we can use HTML inputs ── */}
      <foreignObject x={x} y={y} width={W} height={H}>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: W,
            height: H,
            background: 'var(--ice-bg-surface)',
            border: `1px solid ${border}`,
            borderRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: isSelected
              ? `0 0 0 1.5px ${categoryGlow}, 0 4px 14px -4px ${categoryGlow}33`
              : isHovered
                ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
            opacity: isSource ? 0.85 : 1,
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: `8px ${CARD_PX}px`,
              borderBottom: '1px solid var(--ice-border)',
              background: `linear-gradient(180deg, ${categoryGlow}15 0%, transparent 100%)`,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: `${categoryGlow}25`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: categoryGlow,
                flexShrink: 0,
              }}
            >
              <Globe size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ice-text-1)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label || 'Custom Domain'}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--ice-text-3)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {rootDomain || 'Network · CustomDomain'}
              </div>
            </div>
          </div>

          {/* ── Root domain input ── */}
          <div
            style={{
              padding: `6px ${CARD_PX}px`,
              flexShrink: 0,
              height: DOMAIN_FIELD_HEIGHT,
              boxSizing: 'border-box',
            }}
          >
            <input
              type="text"
              value={rootDomain}
              placeholder="example.com"
              onChange={(e) => updateDomain(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: 12,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: 'var(--ice-text-1)',
                background: 'var(--ice-bg-base)',
                border: '1px solid var(--ice-border)',
                borderRadius: 4,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ── Route rows ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: ROUTE_ROW_GAP,
              padding: `${PADDING}px ${CARD_PX}px 0`,
              minHeight: 0,
              overflow: 'visible',
            }}
          >
            {routes.map((route) => {
              const host = route.subdomain && rootDomain
                ? `${route.subdomain}.${rootDomain}`
                : rootDomain
                  ? rootDomain
                  : route.subdomain || '(set root domain above)';
              return (
                <div
                  key={route.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: ROUTE_ROW_HEIGHT,
                    flexShrink: 0,
                    padding: '0 8px',
                    background: 'var(--ice-bg-base)',
                    border: '1px solid var(--ice-border)',
                    borderRadius: 6,
                    boxSizing: 'border-box',
                    position: 'relative',
                  }}
                >
                  <input
                    type="text"
                    value={route.subdomain}
                    placeholder="root"
                    onChange={(e) => updateRouteSubdomain(route.id, e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 60,
                      flexShrink: 0,
                      padding: '2px 6px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      color: 'var(--ice-text-1)',
                      background: 'transparent',
                      border: '1px solid var(--ice-border)',
                      borderRadius: 4,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      color: rootDomain ? '#3b82f6' : 'var(--ice-text-3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={host}
                  >
                    {host}
                  </div>
                  {routes.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRoute(route.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Delete route"
                      style={{
                        width: 18,
                        height: 18,
                        flexShrink: 0,
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--ice-text-3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Add route button ── */}
          <div
            style={{
              padding: `${PADDING}px ${CARD_PX}px`,
              flexShrink: 0,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                addRoute();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: '6px 12px',
                fontSize: 11,
                color: 'var(--ice-text-2)',
                background: 'transparent',
                border: '1px dashed var(--ice-border)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                outline: 'none',
              }}
            >
              <Plus size={12} />
              Add subdomain route
            </button>
          </div>
        </div>
      </foreignObject>

      {/* ── Per-row connection ports ── */}
      {(isHovered || isSelected || isValidTarget) &&
        portPositions.map((pos, i) => {
          const route = routes[i];
          if (!route) return null;
          return (
            <circle
              key={route.id}
              className="connection-port"
              data-node-id={node.id}
              data-route-id={route.id}
              data-side="right"
              cx={pos.cx}
              cy={pos.cy}
              r={isValidTarget ? 6 : 5}
              fill={isValidTarget ? '#22c55e' : categoryGlow}
              stroke="var(--ice-bg-base)"
              strokeWidth={2}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}

      {/* Left-side port for incoming connections (none allowed but kept
          consistent with other nodes — `canConnect` rejects them
          anyway). */}
      {(isHovered || isSelected || isValidTarget) && (
        <circle
          className="connection-port"
          data-node-id={node.id}
          data-side="left"
          cx={x}
          cy={y + H / 2}
          r={isValidTarget ? 6 : 5}
          fill={isValidTarget ? '#22c55e' : categoryGlow}
          stroke="var(--ice-bg-base)"
          strokeWidth={2}
          style={{ cursor: 'crosshair' }}
        />
      )}
    </g>
  );
};

SvgCustomDomainNode.displayName = 'SvgCustomDomainNode';
