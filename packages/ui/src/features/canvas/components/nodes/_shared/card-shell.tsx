/**
 * CardShell — The SVG+foreignObject card wrapper that every bespoke
 * canvas node can drop content into. Mirrors the chrome used by
 * `SvgCustomDomainNode` and `SvgPrivateNetworkNode` so they look like
 * siblings.
 *
 * Renders the four-zone block layout used across the canvas:
 *
 *   ┌──────────────────────────────────┐
 *   │ [🐘] Title              ⓘ [AWS] │  ← header row + provider stamp
 *   │      service · region            │  ← meta line (auto-computed)
 *   ├──────────────────────────────────┤
 *   │   body slot (block-specific)     │  ← children
 *   │   ↗ https://app.run.app · #abc · 2h │  ← deploy info (when active)
 *   ├──────────────────────────────────┤
 *   │  liveConfig text          ● up   │  ← status footer
 *   └──────────────────────────────────┘
 *
 * The icon container mirrors custom-domain's pattern — a rounded
 * 28x28 tinted box around the brand image / Lucide fallback. Tying
 * every block to that same shape gives the canvas a consistent rhythm.
 *
 * When `lod < 3` (zoomed out), CardShell flips to a poster-style mini
 * view (big centred icon + title + provider stamp + status dot), so a
 * canvas-wide overview still reads as "what kind of block, what cloud,
 * is it healthy" without the body/footer noise. At LOD 3 (default) the
 * full layout renders.
 */

import { CARD_FOOTER_HEIGHT } from '@ice/constants';
import { getPortsForNode } from '@ice/types';
import React, { useCallback, useState, type ReactNode } from 'react';
import { getNodeDragState } from './connection-drag-context';
import { ConnectionDragGlow } from './connection-drag-glow';
import { NodeDeployOverlay } from './node-deploy-overlay';
import { useNodeValidation } from './node-validation-context';
import { useIsNodeOrphan } from './orphan-context';
import { ProviderPill } from './provider-pill';
import { StatusDot } from './status-dot';
import { TypedSockets } from './typed-sockets';
import { ValidationBadge } from './validation-badge';
import { getBrandIcon } from '../../../../../assets/icons/brand-registry';
import { getServiceName } from '../../../../../assets/icons/service-names';
import { CATEGORY_STYLE, CORNER_RADIUS, STATUS_COLORS } from '../../../../../config/canvas-constants';
import { t } from '../../../../../i18n';
import { ConceptInfoTrigger } from '../../../../concept-info';
import type { NodePipelineStatus, SvgCompactNodeProps } from '../compact-node/types';
import type { LucideIcon } from 'lucide-react';

interface CardShellProps {
  node: SvgCompactNodeProps['node'];
  isSelected: boolean;
  isDragOver?: boolean;
  onNodeHover?: (nodeId: string | null) => void;
  connectionDragState?: 'source' | 'valid-target' | 'invalid-target' | null;
  /** Icon component from lucide-react (or similar). */
  icon: LucideIcon;
  /** Override accent color. Default: derived from iceType category. */
  accentColor?: string;
  /** Title in the header (defaults to node.label). */
  title?: string;
  /** Optional override for the meta line under the title. When omitted, it
   *  is auto-computed as `${serviceName} · ${region || 'auto'}`. */
  metaOverride?: string;
  /** Live config string for the status footer (e.g. "3 queues · 30s"). */
  liveConfig?: string;
  /** Trailing slot in the header (extra badges before the provider stamp). */
  headerTrailing?: ReactNode;
  /** Header height (default 48). */
  headerHeight?: number;
  /** Level-of-detail bucket the canvas is rendering at (3=full, 1=zoomed-out). */
  lod?: number;
  /** Live pipeline state for this node — drives commit SHA in the deploy info row. */
  pipelineStatus?: NodePipelineStatus;
  /** Opt out of the default 4-sided connection ports. Blocks with custom
   *  port layouts (e.g. cron with per-task ports) suppress CardShell's
   *  ports and draw their own as siblings to the CardShell `<g>`. */
  customPorts?: boolean;
  /** Override the header brand-icon lookup with this brand key (e.g. a
   *  framework name like "react" or "nextjs"). When set, takes priority
   *  over the iceType-driven lookup; when no match in the brand
   *  registry, falls through to the iceType and then the lucide `icon`. */
  brandOverride?: string;
  /** Card body content. */
  children: ReactNode;
}

/** Pulls the most useful deploy address off `node.data.deploy_outputs` for
 *  the deploy-info row below the body. Mirrors the priority order used by
 *  `CompactLod3`: domain / url / default_url / IP / provider_id. */
function deriveDeployAddress(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const status = (data.deploy_status as string) || '';
  if (status !== 'active') return null;
  const outputs = (data.deploy_outputs as Record<string, unknown> | undefined) || {};
  const customDomain = outputs.custom_domain_url as string | undefined;
  if (customDomain && String(customDomain).trim()) return String(customDomain).trim();
  const domain = outputs.domain as string | undefined;
  if (domain && String(domain).trim()) return `https://${String(domain).trim()}`;
  if (outputs.url) return String(outputs.url);
  if (outputs.default_url) return String(outputs.default_url);
  if (outputs.ip_address || outputs.IPAddress) {
    const ip = String(outputs.ip_address || outputs.IPAddress);
    return `http://${ip}`;
  }
  const providerId = (data.provider_id as string) || '';
  return providerId || null;
}

/** Render an address as a single line — drop the protocol prefix so the
 *  block fits the URL even at narrow widths. */
function shortenAddress(addr: string): string {
  return addr.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function formatRelativeAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t('canvas.time.secondsAgo', { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('canvas.time.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 48) return t('canvas.time.hoursAgo', { n: hr });
  const day = Math.floor(hr / 24);
  return t('canvas.time.daysAgo', { n: day });
}

export const CardShell: React.FC<CardShellProps> = ({
  node,
  isSelected,
  isDragOver: _isDragOver = false,
  onNodeHover,
  connectionDragState = null,
  icon: Icon,
  accentColor,
  title,
  metaOverride,
  liveConfig,
  headerTrailing,
  headerHeight = 48,
  lod,
  pipelineStatus,
  customPorts = false,
  brandOverride,
  children,
}) => {
  const { x, y, data, label } = node;
  const W = node.width;
  const H = node.height;
  const [isHovered, setIsHovered] = useState(false);

  const iceType = (data?.iceType as string) || '';
  const category = iceType.split('.')[0] || 'default';
  const cat = CATEGORY_STYLE[category] || CATEGORY_STYLE.default;
  const ACCENT = accentColor || cat.glow;

  const provider = (data?.provider as string) || '';
  const region = (data?.region as string) || '';
  const deployStatus = (data?.deploy_status as string) || '';
  // CNV1 — in-flight step + failure reason, surfaced on the node (not just the
  // deploy panel). Same data the deploy panel writes onto every node.
  const deployProgress = data?.deploy_progress as
    | { step_label?: string; step_index?: number; step_total?: number }
    | undefined;
  const deployError = (data?.deploy_error as string) || '';

  // brandOverride wins (e.g. frontend blocks pass `framework` so React /
  // Next.js / Vue render in the header). Fall through to the iceType
  // lookup so existing per-block brand mappings keep working.
  const brand = (brandOverride && getBrandIcon(brandOverride)) || getBrandIcon(iceType);

  const serviceName = getServiceName(iceType, provider || 'aws');
  const metaLine =
    metaOverride !== undefined
      ? metaOverride
      : serviceName
        ? `${serviceName} · ${region || 'auto'}`
        : region
          ? region
          : '';

  const statusColor = STATUS_COLORS[deployStatus] || STATUS_COLORS.idle;
  const statusLabel = deployStatus ? deployStatus.charAt(0).toUpperCase() + deployStatus.slice(1) : '';

  const rawIsSource = connectionDragState === 'source';
  const rawIsValidTarget = connectionDragState === 'valid-target';
  const rawIsInvalidTarget = connectionDragState === 'invalid-target';
  // Per-node drag state pulled from the orchestrator-provided singleton.
  // Drives the per-port highlight + magnet-snap glow in TypedSockets.
  // Pure function call (no hook) so this component stays compatible with
  // tests that invoke it as a plain function.
  const {
    compatiblePortIds,
    snappedPortId,
    sourcePortId,
    isSource: isDragSource,
    active: typedDragActive,
  } = getNodeDragState(node.id);
  // When a typed-port drag is in flight, the per-port glow in
  // TypedSockets is the only visual feedback — suppress the whole-block
  // green border / glow so the user reads "socket ↔ socket" not "block
  // ↔ block." Source / invalid styling still applies for the source
  // node itself and for genuinely invalid targets (canConnect failures).
  const isSource = rawIsSource;
  const isValidTarget = typedDragActive ? false : rawIsValidTarget;
  const isInvalidTarget = rawIsInvalidTarget;
  // Orphan signal — the canvas orchestrator populates the OrphanNodes
  // context with the set of blocks that have zero edges. We only show
  // the indicator while no drag is active, so the orphan warning
  // doesn't compete with the valid/invalid border during a connect.
  const isOrphan = useIsNodeOrphan(node.id) && connectionDragState === null;
  // CNV2 — config/validation issues, surfaced on the node (read via context so
  // they needn't thread through every concept-node component). 'info' is not
  // badge-worthy; only error/warning render a corner dot.
  const validation = useNodeValidation(node.id);
  const validationSeverity = validation && validation.severity !== 'info' ? validation.severity : null;
  const validationCount = validation?.count ?? 0;
  // Ports are always rendered (so users can SEE the connection
  // affordance on a fresh block instead of having to discover it via
  // hover). Opacity carries the state: faint at idle, full on
  // hover/selection/source/valid-target, faded out when this block is
  // an invalid drop target during an active drag.
  const renderPorts = !customPorts;
  // Dim blocks that have no compatible port during a typed drag so the
  // user reads "these are out of play" without a tooltip.
  const isNonCompatibleDuringDrag =
    typedDragActive && !isDragSource && (compatiblePortIds === null || compatiblePortIds.size === 0);
  const portOpacity = isInvalidTarget
    ? 0.12
    : isNonCompatibleDuringDrag
      ? 0.25
      : isHovered || isSelected || isValidTarget || isSource
        ? 1
        : 0.35;
  // Derive the typed port list from the node's iceType + property bag.
  // `getPortsForNode` is schema-driven (one port per real semantic
  // connection — repository / domain / database / …) and memoizes
  // internally, so we can call it on every render.
  const sockets = getPortsForNode({ id: node.id, type: node.type, data: node.data });

  const onEnter = useCallback(() => {
    setIsHovered(true);
    onNodeHover?.(node.id);
  }, [node.id, onNodeHover]);
  const onLeave = useCallback(() => {
    setIsHovered(false);
    onNodeHover?.(null);
  }, [onNodeHover]);

  const titleText = title ?? label ?? '';
  const displayTitle = titleText;

  // ─── Icon container (custom-domain style) ─────────────────────────────
  // Header icon is ALWAYS the generic lucide `icon`. Brand identity
  // (framework, GitHub mark, etc.) is the consumer's responsibility to
  // render in the body — see static-site, github-repo. Keeping the
  // header generic means every block reads as "type first, brand
  // second", and `brandOverride` only changes the low-LOD render
  // (where there is no body to host the brand).
  const IconContainer = (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: `${ACCENT}25`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ACCENT,
        flexShrink: 0,
      }}
    >
      <Icon size={16} style={{ color: ACCENT }} />
    </div>
  );

  // ─── LOD 1 view — zoomed-out poster card ───────────────────────────────
  // Show: big centred icon + title + provider mark + status dot. No body,
  // no footer, no meta line — just the "what is this thing, what cloud,
  // is it healthy" trio that survives at low zoom.
  if (lod !== undefined && lod < 3) {
    return (
      <g>
        <foreignObject x={x} y={y} width={W} height={H}>
          <div
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            style={{
              width: W,
              height: H,
              background: 'var(--ice-bg-raised)',
              border: `1px solid ${isSelected || isHovered ? ACCENT : ACCENT + '55'}`,
              borderRadius: CORNER_RADIUS,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxSizing: 'border-box',
              overflow: 'hidden',
              boxShadow: isSelected
                ? `0 0 0 1.5px ${ACCENT}, 0 4px 14px -4px ${ACCENT}33`
                : isHovered
                  ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                  : '0 1px 3px rgba(0,0,0,0.06)',
              opacity: isNonCompatibleDuringDrag ? 0.35 : isSource ? 0.85 : 1,
              padding: 12,
            }}
            data-testid={`cardshell-lod1-${node.id}`}
          >
            {/* Low-LOD center: when a brand is available, show BOTH the
                generic lucide icon AND the brand mark side-by-side so
                the user can read both "what type" and "which
                framework/vendor" without zooming in. Without a brand,
                we fall back to the lucide-only block to preserve the
                existing visual weight. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: `${ACCENT}25`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: ACCENT,
                  flexShrink: 0,
                }}
              >
                <Icon size={32} style={{ color: ACCENT }} />
              </div>
              {brand?.url && (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: 'var(--ice-bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={brand.url}
                    alt={brand.label}
                    width={36}
                    height={36}
                    draggable={false}
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ice-text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                textAlign: 'center',
              }}
            >
              {displayTitle}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ProviderPill provider={provider} />
              {deployStatus && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: statusColor,
                    opacity: 0.9,
                  }}
                  title={statusLabel}
                />
              )}
            </div>
          </div>
        </foreignObject>
        {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} />}
        {isInvalidTarget && (
          <rect
            x={x - 3}
            y={y - 3}
            width={W + 6}
            height={H + 6}
            rx={CORNER_RADIUS + 3}
            fill="none"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="4 3"
            opacity={0.85}
            pointerEvents="none"
          />
        )}
        {isOrphan && (
          <rect
            x={x - 2}
            y={y - 2}
            width={W + 4}
            height={H + 4}
            rx={CORNER_RADIUS + 2}
            fill="none"
            stroke="#d97706"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            opacity={0.6}
            pointerEvents="none"
          />
        )}
        {renderPorts && (
          <TypedSockets
            nodeId={node.id}
            x={x}
            y={y}
            width={W}
            height={H}
            sockets={sockets}
            isValidTarget={isValidTarget}
            opacity={portOpacity}
            lod={lod ?? 3}
            compatiblePortIds={compatiblePortIds}
            snappedPortId={snappedPortId}
            isDragSource={isDragSource}
            sourcePortId={sourcePortId}
          />
        )}
      </g>
    );
  }

  // ─── LOD 3 (default) — full card ───────────────────────────────────────
  const deployAddress = deriveDeployAddress(data);
  const isActive = deployStatus === 'active';
  const commitShaShort = pipelineStatus?.commitSha ? pipelineStatus.commitSha.slice(0, 7) : '';
  const deployedAt = (data?.last_deployed_at as string) || (data?.deployed_at as string) || '';
  const deployedAtRelative = (() => {
    if (!deployedAt) return '';
    const ts = Date.parse(deployedAt);
    if (!Number.isFinite(ts)) return '';
    return formatRelativeAge(Date.now() - ts);
  })();
  const deployInfoParts = [commitShaShort && `#${commitShaShort}`, deployedAtRelative].filter(Boolean);
  const showDeployRow = isActive && !!deployAddress;

  const showFooter = !!liveConfig || !!deployStatus;

  return (
    <g>
      <foreignObject x={x} y={y} width={W} height={H}>
        <div
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          style={{
            width: W,
            height: H,
            background: 'var(--ice-bg-raised)',
            border: `1px solid ${isSelected || isHovered ? ACCENT : ACCENT + '55'}`,
            borderRadius: CORNER_RADIUS,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: isSelected
              ? `0 0 0 1.5px ${ACCENT}, 0 4px 14px -4px ${ACCENT}33`
              : isHovered
                ? '0 2px 8px -2px rgba(0,0,0,0.15)'
                : '0 1px 3px rgba(0,0,0,0.06)',
            opacity: isNonCompatibleDuringDrag ? 0.35 : isSource ? 0.85 : 1,
            transition: 'box-shadow 150ms ease, border-color 150ms ease',
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid var(--ice-border-subtle, var(--ice-border))',
              flexShrink: 0,
              minHeight: headerHeight,
              boxSizing: 'border-box',
            }}
          >
            {IconContainer}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--ice-text-primary)',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {displayTitle}
              </div>
              {metaLine && (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11,
                    fontWeight: 400,
                    color: 'var(--ice-text-tertiary)',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {metaLine}
                </div>
              )}
            </div>
            {headerTrailing}
            <ConceptInfoTrigger iceType={iceType} displayName={displayTitle} opacity={isHovered ? 0.85 : 0.4} />
            <ProviderPill provider={provider} />
          </div>

          {/* ── Body slot ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '10px 14px 12px',
              gap: 8,
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {children}
            {showDeployRow && (
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                  fontSize: 10,
                  color: 'var(--ice-text-2)',
                  borderTop: '1px dashed var(--ice-border)',
                  paddingTop: 4,
                }}
                data-testid={`cardshell-deploy-info-${node.id}`}
              >
                <span
                  style={{
                    color: '#22c55e',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    flex: 1,
                  }}
                  title={`Click to open · ${deployAddress}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (/^https?:\/\//.test(deployAddress!)) {
                      window.open(deployAddress!, '_blank', 'noopener,noreferrer');
                    } else {
                      navigator.clipboard?.writeText(deployAddress!).catch(() => {});
                    }
                  }}
                >
                  ↗ {shortenAddress(deployAddress!)}
                </span>
                {deployInfoParts.length > 0 && (
                  <span
                    style={{
                      color: 'var(--ice-text-tertiary)',
                      opacity: 0.75,
                      flexShrink: 0,
                    }}
                  >
                    {deployInfoParts.join(' · ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Status footer ── */}
          {showFooter && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 14px',
                borderTop: '1px solid var(--ice-border-subtle, var(--ice-border))',
                flexShrink: 0,
                minHeight: CARD_FOOTER_HEIGHT,
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
                  color: 'var(--ice-text-tertiary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {liveConfig || ''}
              </span>
              {deployStatus && (
                <StatusDot
                  color={statusColor}
                  label={statusLabel.toLowerCase()}
                  pulse={deployStatus === 'deploying' || deployStatus === 'queued'}
                />
              )}
            </div>
          )}

          {/* CNV1 — live deploy progress / error overlay, raised above the
              status footer when one is shown. */}
          <NodeDeployOverlay
            deployStatus={deployStatus}
            deployProgress={deployProgress}
            deployError={deployError}
            bottom={showFooter ? CARD_FOOTER_HEIGHT + 6 : 6}
          />

          {/* CNV2 — validation badge (config errors/warnings) in the top-right corner. */}
          {validationSeverity && (
            <div
              data-testid="card-shell-validation-badge"
              style={{ position: 'absolute', top: -2, right: -2, zIndex: 2 }}
            >
              <ValidationBadge severity={validationSeverity} count={validationCount} />
            </div>
          )}
        </div>
      </foreignObject>
      {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} />}
      {isInvalidTarget && (
        <rect
          x={x - 3}
          y={y - 3}
          width={W + 6}
          height={H + 6}
          rx={CORNER_RADIUS + 3}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.85}
          pointerEvents="none"
        />
      )}
      {isOrphan && (
        <rect
          x={x - 2}
          y={y - 2}
          width={W + 4}
          height={H + 4}
          rx={CORNER_RADIUS + 2}
          fill="none"
          stroke="#d97706"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          opacity={0.6}
          pointerEvents="none"
        />
      )}
      {renderPorts && (
        <TypedSockets
          nodeId={node.id}
          x={x}
          y={y}
          width={W}
          height={H}
          sockets={sockets}
          isValidTarget={isValidTarget}
          opacity={portOpacity}
          lod={lod ?? 3}
        />
      )}
    </g>
  );
};

CardShell.displayName = 'CardShell';
