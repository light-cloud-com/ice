/**
 * SvgSecureGroupNode — Custom canvas renderer for `Network.SecureGroup`
 *
 * Layout: top "Public Traffic" entry-point header (decorative — the
 * block IS the security boundary, no separate port for the public),
 * a LEFT SIDEBAR of subdomain routes (one row per route, each with
 * its own port on the inner edge pointing into the children area),
 * and a children area filling the rest of the box where compute
 * blocks (Cloud Run, databases, etc.) nest inside.
 *
 *   ┌─ ⬇ Public Traffic ────────────────  🛡 example.com ─┐
 *   ├──────┬─────────────────────────────────────────────┤
 *   │ 🛡   │                                             │
 *   │      │   ┌─ Web App ─┐    ┌─ API ──┐               │
 *   │ root │●─→            │    │        │               │
 *   │      │   └───────────┘    └────────┘               │
 *   │  app │●─→                    ↑                     │
 *   │      │                       │                     │
 *   │  api │●──────────────────→ ┌─ DB ──┐               │
 *   │      │                     │       │               │
 *   │ + add│                     └───────┘               │
 *   │      │                                             │
 *   └──────┴─────────────────────────────────────────────┘
 *
 * Why the routes are on the LEFT (inside-pointing) instead of the
 * right edge: edges from each row's port go INTO the children area,
 * which lives inside the same block. Right-edge ports would force
 * the edge to loop back, which is visually confusing and hides the
 * "this route → that service inside" mental model. With the sidebar
 * layout, the edge runs from the row's port directly into the
 * adjacent child, all within the SecureGroup boundary.
 *
 * Children render through the standard svg-canvas dispatcher (their
 * `parentId` points at this SecureGroup so they nest naturally) — this
 * renderer just paints the FRAME: the box outline, the entry-point
 * header, the routes sidebar, and the children-area background hint.
 */

import React, { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { Shield, Plus, X, Loader2, CheckCircle2, AlertCircle, ArrowDownToLine } from 'lucide-react';

import { CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { selectActiveCard } from '../../../../../store/slices/cards-slice';
import type { SvgCompactNodeProps } from '../compact-node/types';

// ─── Layout constants ───────────────────────────────────────────────────────
//
// Exported so SvgConnectionPath can compute the exact position of
// each route's port for edge anchoring. The KEY change from the v1
// layout: ports are now on the LEFT sidebar's inner edge (at x =
// SG_SIDEBAR_WIDTH), pointing INTO the children area, not on the
// right edge of the whole block.

export const SG_HEADER_HEIGHT = 44;
export const SG_SIDEBAR_WIDTH = 168;
export const SG_DOMAIN_FIELD_HEIGHT = 0; // moved into header row, no separate row
export const SG_ROUTE_ROW_HEIGHT = 32;
export const SG_ROUTE_ROW_GAP = 6;
export const SG_CERT_STATUS_HEIGHT = 26;
export const SG_PADDING = 10;
export const SG_ADD_BUTTON_HEIGHT = 28;
export const SG_CHILDREN_MIN_HEIGHT = 240;
const CARD_PX = 10;

interface Route {
  id: string;
  subdomain: string;
}

/**
 * Position (relative to node origin) of the right-edge connection
 * port for the Nth route row in the LEFT sidebar. The port `x` is at
 * the inner edge of the sidebar so edges starting here flow naturally
 * into the children area to the right.
 *
 * Shared with `SvgConnectionPath` so edges anchor to the exact pixel
 * where the port circle is rendered.
 */
export function getSecureGroupRoutePortPosition(rowIndex: number): { x: number; y: number } {
  const firstRowTop = SG_HEADER_HEIGHT + SG_PADDING;
  return {
    x: SG_SIDEBAR_WIDTH,
    y: firstRowTop + rowIndex * (SG_ROUTE_ROW_HEIGHT + SG_ROUTE_ROW_GAP) + SG_ROUTE_ROW_HEIGHT / 2,
  };
}

/**
 * Total height of the block — depends on the routes count and the
 * minimum children area. Called from `svg-canvas.tsx`'s `canvasNodes`
 * useMemo so React re-measures the node when routes are added/removed.
 */
export function computeSecureGroupHeight(data: Record<string, unknown>, currentHeight = 0): number {
  const routes = (data?.routes as Route[] | undefined) || [];
  const certStatus = (data?.cert_status as string) || '';
  const sidebarContentHeight =
    SG_HEADER_HEIGHT +
    SG_PADDING +
    routes.length * (SG_ROUTE_ROW_HEIGHT + SG_ROUTE_ROW_GAP) +
    SG_PADDING +
    SG_ADD_BUTTON_HEIGHT +
    (certStatus ? SG_CERT_STATUS_HEIGHT + SG_PADDING : 0) +
    SG_PADDING;
  // The block also needs space for the children area. Take whichever
  // is bigger: the sidebar's content height or the user's resized
  // current height (with a sensible minimum).
  const minTotal = Math.max(sidebarContentHeight, SG_HEADER_HEIGHT + SG_CHILDREN_MIN_HEIGHT);
  return Math.max(currentHeight, minTotal);
}

export function computeSecureGroupWidth(currentWidth = 0): number {
  return Math.max(currentWidth, 600);
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

interface CertStatusInfo {
  icon: React.ReactNode;
  label: string;
  color: string;
}

function describeCertStatus(status: string): CertStatusInfo | null {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper === 'ACTIVE' || upper === 'OK_CONFIGURED' || upper === 'OK') {
    return { icon: <CheckCircle2 size={12} />, label: 'SSL active', color: '#22c55e' };
  }
  if (upper === 'PROVISIONING' || upper === 'PROVISIONING_FAILED_TEMPORARY') {
    return {
      icon: <Loader2 size={12} className="animate-spin" />,
      label: 'Provisioning SSL cert…',
      color: '#3b82f6',
    };
  }
  if (
    upper === 'FAILED_NOT_VISIBLE' ||
    upper === 'FAILED_CAA_FORBIDDEN' ||
    upper === 'FAILED_CAA_CHECKING' ||
    upper === 'FAILED_RATE_LIMITED' ||
    upper.startsWith('FAILED')
  ) {
    return { icon: <AlertCircle size={12} />, label: `SSL: ${status}`, color: '#ef4444' };
  }
  return { icon: <Loader2 size={12} className="animate-spin" />, label: `SSL: ${status}`, color: '#f59e0b' };
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SvgSecureGroupNode: React.FC<SvgCompactNodeProps> = ({
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

  const rootDomain = String(data?.domain || '').trim();
  const routes = ((data?.routes as Route[] | undefined) || []).slice();
  const certStatus = String(data?.cert_status || '').trim();
  const certInfo = describeCertStatus(certStatus);

  // ── Ingress allowlist: count edges that target this SecureGroup
  //    from EXTERNAL services (not nested children). The user wires
  //    these by dragging from a frontend / service onto the top
  //    ingress port. If the count is 0, the SecureGroup is "open" —
  //    any service can call it. If > 0, only the listed sources are
  //    allowed (enforced via Cloud Armor / CORS at deploy time).
  const activeCard = useSelector(selectActiveCard);
  const ingressSourceCount = (() => {
    if (!activeCard) return 0;
    const childIds = new Set(
      activeCard.nodes.filter((n: any) => n.parentId === node.id).map((n: any) => n.id),
    );
    let count = 0;
    for (const e of activeCard.edges as any[]) {
      if (e.target !== node.id) continue;
      if (childIds.has(e.source)) continue;
      count++;
    }
    return count;
  })();

  // "Fortress" palette: dark slate sidebar with red accent for the
  // security boundary, suggesting "fortified, protected, controlled
  // access." Distinct from Custom Domain (blue, public DNS) and from
  // a generic group (configurable color).
  const FORTRESS_BORDER = '#991b1b'; // red-800 — darker than alert red, more "shield"
  const FORTRESS_ACCENT = '#dc2626'; // red-600 — for the entry-point arrow
  const FORTRESS_SIDEBAR = 'rgb(15 23 42)'; // slate-900
  const FORTRESS_SIDEBAR_HOVER = 'rgb(30 41 59)'; // slate-800
  const FORTRESS_CHILDREN_TINT = 'rgba(220, 38, 38, 0.04)'; // very subtle red wash

  const isValidTarget = connectionDragState === 'valid-target';
  const isInvalidTarget = connectionDragState === 'invalid-target';

  const border =
    isDragOver
      ? '#22d3ee'
      : isValidTarget
        ? '#22c55e'
        : isInvalidTarget
          ? '#ef4444'
          : isSelected
            ? FORTRESS_ACCENT
            : FORTRESS_BORDER;

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

  // ── Per-route port positions (on the inner edge of the sidebar) ──
  const portPositions = routes.map((_, i) => {
    const pos = getSecureGroupRoutePortPosition(i);
    return { cx: x + pos.x, cy: y + pos.y };
  });

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
      {/* ── Outer container background — full block size, very subtle red tint ── */}
      <rect
        x={x}
        y={y}
        width={W}
        height={H}
        rx={CORNER_RADIUS}
        fill={FORTRESS_CHILDREN_TINT}
        stroke={border}
        strokeWidth={isSelected ? 2 : 1.5}
        strokeDasharray={isDragOver ? '6 4' : undefined}
        style={{ cursor: 'pointer' }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      />

      {/* ── Top ingress header — has an actual incoming port that
            external services connect TO. Each connection becomes an
            entry in the "allowed inbound sources" allowlist. ── */}
      <foreignObject x={x} y={y} width={W} height={SG_HEADER_HEIGHT}>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: W,
            height: SG_HEADER_HEIGHT,
            background: `linear-gradient(180deg, ${FORTRESS_BORDER} 0%, ${FORTRESS_SIDEBAR} 100%)`,
            color: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: `0 ${CARD_PX}px`,
            borderRadius: `${CORNER_RADIUS}px ${CORNER_RADIUS}px 0 0`,
            borderBottom: `2px solid ${FORTRESS_ACCENT}`,
            boxSizing: 'border-box',
          }}
        >
          {/* Ingress allowlist indicator — left-aligned label showing
              the count of currently-connected external sources. The
              actual port circle is rendered as a sibling SVG element
              below (foreignObject can't host SVG ports cleanly). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              opacity: 0.95,
            }}
            title={
              ingressSourceCount === 0
                ? 'Open ingress — any service can reach the routes inside. Connect a frontend or service to this port to restrict access.'
                : `Ingress allowlist: ${ingressSourceCount} source${ingressSourceCount === 1 ? '' : 's'} can reach the routes inside.`
            }
          >
            <ArrowDownToLine size={14} />
            <span style={{ fontWeight: 600 }}>Ingress allowlist</span>
            <span
              style={{
                padding: '1px 6px',
                background: ingressSourceCount > 0 ? FORTRESS_ACCENT : 'rgba(255,255,255,0.15)',
                borderRadius: 8,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {ingressSourceCount === 0 ? 'open' : ingressSourceCount}
            </span>
          </div>
          {/* Spacer */}
          <div style={{ flex: 1 }} />
          {/* Shield + root domain field */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <Shield size={14} />
            <input
              type="text"
              value={rootDomain}
              placeholder="example.com"
              onChange={(e) => updateDomain(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 180,
                padding: '4px 8px',
                fontSize: 11,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: '#fef2f2',
                background: 'rgba(0, 0, 0, 0.4)',
                border: `1px solid ${FORTRESS_ACCENT}80`,
                borderRadius: 4,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </foreignObject>

      {/* ── Ingress port — sits at the top center of the block,
            outside the foreignObject so it can be a real SVG circle
            with the connection-port class for hit-testing. Always
            visible (not hover-gated) so users can see where to drop
            external services. ── */}
      <circle
        className="connection-port"
        data-node-id={node.id}
        data-side="top"
        cx={x + W / 2}
        cy={y}
        r={6}
        fill={ingressSourceCount > 0 ? '#22c55e' : FORTRESS_ACCENT}
        stroke={FORTRESS_SIDEBAR}
        strokeWidth={2}
        style={{ cursor: 'crosshair' }}
      >
        <title>
          {ingressSourceCount === 0
            ? 'Drop a service here to allow it to call into this Secure Group'
            : `${ingressSourceCount} service${ingressSourceCount === 1 ? '' : 's'} allowed inbound`}
        </title>
      </circle>

      {/* ── Block label (above the box, like a normal group) ── */}
      <text
        x={x + 12}
        y={y - 6}
        fontSize={11}
        fill={FORTRESS_BORDER}
        fontWeight={600}
        style={{ pointerEvents: 'none', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
      >
        🛡 {label || 'Secure Group'}
      </text>

      {/* ── Left sidebar with routes ── */}
      <foreignObject
        x={x}
        y={y + SG_HEADER_HEIGHT}
        width={SG_SIDEBAR_WIDTH}
        height={H - SG_HEADER_HEIGHT}
      >
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: SG_SIDEBAR_WIDTH,
            height: H - SG_HEADER_HEIGHT,
            background: FORTRESS_SIDEBAR,
            borderRight: `2px solid ${FORTRESS_ACCENT}`,
            borderBottomLeftRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            padding: `${SG_PADDING}px ${CARD_PX}px ${SG_PADDING}px ${CARD_PX}px`,
            color: '#fef2f2',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar label */}
          <div
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              color: '#fca5a5',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 6,
              opacity: 0.8,
            }}
          >
            Subdomain Routes
          </div>

          {/* Route rows */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: SG_ROUTE_ROW_GAP,
              flex: 1,
              minHeight: 0,
            }}
          >
            {routes.map((route) => {
              const host = route.subdomain && rootDomain
                ? `${route.subdomain}.${rootDomain}`
                : rootDomain || route.subdomain || '—';
              return (
                <div
                  key={route.id}
                  title={host}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    height: SG_ROUTE_ROW_HEIGHT,
                    flexShrink: 0,
                    padding: '0 6px',
                    background: 'rgba(220, 38, 38, 0.12)',
                    border: `1px solid ${FORTRESS_ACCENT}40`,
                    borderRadius: 4,
                    boxSizing: 'border-box',
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
                      flex: 1,
                      minWidth: 0,
                      padding: '2px 4px',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      color: '#fef2f2',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {routes.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteRoute(route.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Delete route"
                      style={{
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 3,
                      }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* + Add route */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              addRoute();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              marginTop: SG_PADDING,
              width: '100%',
              height: SG_ADD_BUTTON_HEIGHT,
              padding: '0 8px',
              fontSize: 10,
              color: '#fca5a5',
              background: 'transparent',
              border: `1px dashed ${FORTRESS_ACCENT}60`,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              outline: 'none',
              flexShrink: 0,
              boxSizing: 'border-box',
            }}
          >
            <Plus size={11} />
            Add route
          </button>

          {/* Cert status (when present) */}
          {certInfo && (
            <div
              style={{
                marginTop: SG_PADDING,
                height: SG_CERT_STATUS_HEIGHT,
                flexShrink: 0,
                padding: '0 8px',
                background: `${certInfo.color}20`,
                border: `1px solid ${certInfo.color}50`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 10,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: certInfo.color,
                boxSizing: 'border-box',
              }}
              title={certInfo.label}
            >
              {certInfo.icon}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {certInfo.label}
              </span>
            </div>
          )}
        </div>
      </foreignObject>

      {/* ── Children area placeholder (visible only when no children
            yet — once children are dropped they render on top via the
            normal dispatcher) ── */}
      <foreignObject
        x={x + SG_SIDEBAR_WIDTH}
        y={y + SG_HEADER_HEIGHT}
        width={W - SG_SIDEBAR_WIDTH}
        height={H - SG_HEADER_HEIGHT}
        pointerEvents="none"
      >
        <div
          style={{
            width: W - SG_SIDEBAR_WIDTH,
            height: H - SG_HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            padding: 12,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              color: FORTRESS_BORDER,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              opacity: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            🔒 Private network · drop services here
          </div>
        </div>
      </foreignObject>

      {/* ── Per-row connection ports on the inner edge of the sidebar ── */}
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
              fill={isValidTarget ? '#22c55e' : FORTRESS_ACCENT}
              stroke={FORTRESS_SIDEBAR}
              strokeWidth={2}
              style={{ cursor: 'crosshair' }}
            />
          );
        })}
    </g>
  );
};

SvgSecureGroupNode.displayName = 'SvgSecureGroupNode';
