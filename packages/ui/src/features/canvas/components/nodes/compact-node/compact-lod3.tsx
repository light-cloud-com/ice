import React, { memo } from 'react';
import { ConnectedPipelineDots } from './connected-pipeline-dots';
import { MetadataLines } from './metadata-lines';
import { PipelineRow } from './pipeline-row';
import { ScalingRow } from './scaling-row';
import { ServiceLine } from './service-line';
import { StatusCostLine } from './status-cost-line';
import { CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS } from '../../../../../config/canvas-constants';
import { ConceptInfoTrigger } from '../../../../concept-info';
import { ConnectionDragGlow } from '../_shared/connection-drag-glow';
import { ConnectionPorts } from '../_shared/connection-ports';
import { DragOverGlow } from '../_shared/drag-over-glow';
import { FoldButton } from '../_shared/fold-button';
import { FONT_MONO } from '../_shared/fonts';
import { NodeHeader } from '../_shared/node-header';
import { ProviderPill } from '../_shared/provider-pill';
import { ValidationBadge } from '../_shared/validation-badge';
import type { NodePipelineStatus } from './types';
import type { BrandIcon } from '../../../../../assets/icons/brand-registry';
import type { CanvasNode } from '../../svg-canvas';

interface CompactLod3Props {
  node: CanvasNode;
  x: number;
  y: number;
  label: string;
  category: string;
  categoryGlow: string;
  provider: string;
  brandIcon: BrandIcon | null;
  providerUrl: string;
  serviceLineText: string;
  runtimeLabel: string;
  metaLines: string[];
  repoLineIndex: number;
  isSourceRepo: boolean;
  repository: string;
  statusLabel: string;
  statusColor: string;
  estimatedCost: string;
  border: string;
  isSelected: boolean;
  isHovered: boolean;
  isDragOver: boolean;
  folded: boolean;
  hasScaling: boolean;
  minInstances: number | null;
  maxInstances: number | null;
  activeInstances: number | null;
  effectivePipelineStatus: NodePipelineStatus | null;
  connectedPipelineStatuses: NodePipelineStatus[];
  connectionDragState: 'valid-target' | 'invalid-target' | 'source' | null;
  validationSeverity: 'error' | 'warning' | 'info' | null;
  validationCount: number;
  reducedMotion: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleFold: (e: React.MouseEvent) => void;
  onDoubleClickLabel?: () => void;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  onPipelineClick?: (nodeId: string) => void;
}

export const CompactLod3: React.FC<CompactLod3Props> = memo(
  ({
    node,
    x,
    y,
    label,
    category,
    categoryGlow,
    provider,
    brandIcon,
    providerUrl,
    serviceLineText,
    runtimeLabel,
    metaLines,
    repoLineIndex,
    isSourceRepo,
    repository,
    statusLabel,
    statusColor,
    estimatedCost,
    border,
    isSelected,
    isHovered,
    isDragOver,
    folded,
    hasScaling,
    minInstances,
    maxInstances,
    activeInstances,
    effectivePipelineStatus,
    connectedPipelineStatuses,
    connectionDragState,
    validationSeverity,
    validationCount,
    reducedMotion,
    onMouseEnter,
    onMouseLeave,
    onToggleFold,
    onDoubleClickLabel,
    onUpdateData,
    onPipelineClick,
  }) => {
    const W = CARD_WIDTH;
    const H = folded ? 38 : CARD_HEIGHT;
    const isValidTarget = connectionDragState === 'valid-target';
    const hasPipeline = effectivePipelineStatus && effectivePipelineStatus.status !== 'idle';
    const hasStatusLine = !!(statusLabel || estimatedCost);

    // Phase 2 — live deploy overlay. Pulls the deploy-specific fields the
    // panel already writes into node data and renders a visible overlay so
    // the user can see which block is currently deploying without having
    // the deploy panel open.
    const deployStatus = (node.data?.deploy_status as string) || '';
    const deployProgress = node.data?.deploy_progress as
      | { step_label?: string; step_index?: number; step_total?: number }
      | undefined;
    const deployError = (node.data?.deploy_error as string) || '';
    const providerId = (node.data?.provider_id as string) || '';
    const deployOutputs = (node.data?.deploy_outputs as Record<string, unknown> | undefined) || {};
    const isDeploying = deployStatus === 'deploying';
    const isActive = deployStatus === 'active';
    const isError = deployStatus === 'error';

    // Deploy badge config — shown inline in the header instead of border overrides
    const deployBadge = (() => {
      if (isActive) return { color: '#22c55e', label: 'LIVE' };
      if (isDeploying) return { color: '#3b82f6', label: 'DEPLOY' };
      if (isError) return { color: '#ef4444', label: 'ERR' };
      return null;
    })();

    // Pick the single most important output to show as a pill under the
    // block label when active. This is a compact version of the logic in
    // `packages/ui/src/features/deploy/output-extractors.ts`.
    //
    // Priority order:
    //   1. Custom domain URL (propagated from CustomDomain via the node
    //      overlay endpoint) — the friendliest URL the user will actually
    //      visit.
    //   2. Any other URL output (Cloud Run service URL, etc.).
    //   3. Default URL preserved from the handler (bucket HTTPS, run.app URL).
    //   4. For buckets specifically, the gs:// path.
    //   5. Raw IP address for forwarding rules.
    //   6. provider_id as a last-resort fallback so the user always sees
    //      SOMETHING clickable.
    // The block can show two URLs simultaneously:
    //   - PRIMARY: the user-meaningful URL (custom domain when present)
    //   - SECONDARY: the always-live provider URL underneath (firebase
    //     `<site>.web.app`, bucket HTTPS, raw IP)
    //
    // For Firebase Hosting + custom domain: primary = `https://app.example.com`,
    // secondary = `https://<site>.web.app`. The user wants to see BOTH
    // because the custom domain may not resolve until DNS is set up,
    // and the firebase URL is always reachable in the meantime.
    const customDomainUrl = deployOutputs.custom_domain_url as string | undefined;
    const defaultUrlValue = deployOutputs.default_url as string | undefined;

    const primaryOutputText: string | null = (() => {
      if (!isActive) return null;
      const type = (node.data?.iceType as string) || '';
      if (customDomainUrl && String(customDomainUrl).trim()) return String(customDomainUrl).trim();
      const domain = deployOutputs.domain as string | undefined;
      if (domain && String(domain).trim()) return `https://${String(domain).trim()}`;
      if (deployOutputs.url) return String(deployOutputs.url);
      if (defaultUrlValue) return String(defaultUrlValue);
      if (type.includes('StaticSite') || providerId.startsWith('gs://')) {
        return providerId || (deployOutputs.name ? `gs://${deployOutputs.name}` : null);
      }
      if (deployOutputs.ip_address || deployOutputs.IPAddress) {
        const ip = String(deployOutputs.ip_address || deployOutputs.IPAddress);
        return `http://${ip}`;
      }
      return providerId || null;
    })();

    // Secondary URL: always show the firebase URL (or any default_url)
    // underneath the primary when it's distinct. Lets the user click
    // through to the always-live endpoint while the custom domain is
    // still propagating DNS.
    const secondaryOutputText: string | null = (() => {
      if (!isActive || !primaryOutputText) return null;
      if (defaultUrlValue && defaultUrlValue !== primaryOutputText) return String(defaultUrlValue);
      return null;
    })();

    const iceTypeForInfo = (node.data?.iceType as string) || '';
    const infoTrigger = (
      <ConceptInfoTrigger iceType={iceTypeForInfo} displayName={label} opacity={isHovered ? 0.85 : 0.45} />
    );

    const deployBadgeEl = deployBadge ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          padding: '1px 5px',
          borderRadius: 3,
          background: deployBadge.color + '18',
          fontSize: 9,
          fontWeight: 700,
          fontFamily: FONT_MONO,
          color: deployBadge.color,
          letterSpacing: '0.04em',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: deployBadge.color,
            animation: isDeploying && !reducedMotion ? 'pulse-opacity 1.5s ease-in-out infinite' : undefined,
          }}
        />
        {deployBadge.label}
      </span>
    ) : null;

    const headerTrailing = folded ? (
      <>
        {runtimeLabel && (
          <span style={{ color: 'var(--ice-text-secondary)', fontSize: 9, fontFamily: FONT_MONO, flexShrink: 0 }}>
            {runtimeLabel.length > 10 ? runtimeLabel.slice(0, 10) + '\u2026' : runtimeLabel}
          </span>
        )}
        {deployBadgeEl}
        {infoTrigger}
        <FoldButton folded onClick={onToggleFold} opacity={isHovered ? 0.8 : 0.4} />
      </>
    ) : (
      <>
        {deployBadgeEl}
        {provider ? <ProviderPill provider={provider} /> : null}
        {infoTrigger}
      </>
    );

    return (
      <g
        className="svg-compact-node"
        data-node-id={node.id}
        style={{ cursor: isValidTarget ? 'crosshair' : 'move' }}
        opacity={connectionDragState === 'invalid-target' ? 0.3 : 1}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {isDragOver && <DragOverGlow x={x} y={y} width={W} height={H} />}
        {isValidTarget && <ConnectionDragGlow x={x} y={y} width={W} height={H} reducedMotion={reducedMotion} />}

        <foreignObject x={x} y={y} width={W} height={H}>
          <div
            style={{
              width: W,
              height: H,
              background: 'var(--ice-bg-raised)',
              border: `1px solid ${isValidTarget ? '#22c55e' : border}`,
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
              transition: 'box-shadow 150ms ease, border-color 150ms ease',
            }}
          >
            {/* Content */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                padding: folded ? '0 12px' : '10px 14px 8px',
                gap: folded ? 0 : 4,
                justifyContent: folded ? 'center' : undefined,
              }}
            >
              <NodeHeader
                category={category}
                categoryColor={categoryGlow}
                label={label}
                onDoubleClickLabel={onDoubleClickLabel}
                trailing={headerTrailing}
                hideIcon={false}
                iconSize={16}
                labelFontSize={folded ? 12 : 13}
              />

              {!folded && (
                <>
                  <ServiceLine brandIcon={brandIcon} providerUrl={providerUrl} serviceLineText={serviceLineText} />

                  <MetadataLines
                    metaLines={metaLines}
                    repoLineIndex={repoLineIndex}
                    isSelected={isSelected}
                    isHovered={isHovered}
                    isSourceRepo={isSourceRepo}
                    repository={repository}
                    nodeId={node.id}
                    onUpdateData={onUpdateData}
                  />

                  {hasScaling && (
                    <ScalingRow
                      nodeId={node.id}
                      minInstances={minInstances}
                      maxInstances={maxInstances}
                      activeInstances={activeInstances}
                      onUpdateData={onUpdateData}
                    />
                  )}

                  {hasPipeline && effectivePipelineStatus && (
                    <PipelineRow
                      status={effectivePipelineStatus}
                      reducedMotion={reducedMotion}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPipelineClick?.(node.id);
                      }}
                    />
                  )}

                  {isSourceRepo && connectedPipelineStatuses.length > 0 && !hasPipeline && (
                    <ConnectedPipelineDots statuses={connectedPipelineStatuses} />
                  )}

                  {hasStatusLine && (
                    <StatusCostLine statusLabel={statusLabel} statusColor={statusColor} estimatedCost={estimatedCost} />
                  )}

                  {/* Phase 2 — live deploy feedback. Rendered absolute-positioned
                    at the bottom of the block so it doesn't push layout
                    around as status changes. */}
                  {isDeploying && deployProgress?.step_label && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 8,
                        right: 8,
                        bottom: 4,
                        fontSize: 10,
                        color: '#3b82f6',
                        fontFamily: FONT_MONO,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        pointerEvents: 'none',
                      }}
                    >
                      {deployProgress.step_index != null && deployProgress.step_total != null
                        ? `${deployProgress.step_label} (${deployProgress.step_index}/${deployProgress.step_total})`
                        : deployProgress.step_label}
                    </div>
                  )}

                  {isActive &&
                    primaryOutputText &&
                    (() => {
                      // Click behavior:
                      //   - If the text is an http(s) URL → open in a new tab
                      //     so users can actually VISIT their deployed site.
                      //   - Shift+click always copies (escape hatch when users
                      //     want the URL on the clipboard without navigating).
                      //   - Non-URLs (gs://, raw IP, provider_id) copy since
                      //     there's nothing to open.
                      const renderUrlRow = (text: string, color: string, bottom: number) => {
                        const isHttpUrl = /^https?:\/\//.test(text);
                        const tooltip = isHttpUrl
                          ? `Click to open · Shift+click to copy: ${text}`
                          : `Click to copy: ${text}`;
                        return (
                          <div
                            key={`${text}-${bottom}`}
                            style={{
                              position: 'absolute',
                              left: 8,
                              right: 8,
                              bottom,
                              fontSize: 10,
                              color,
                              fontFamily: FONT_MONO,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              cursor: 'pointer',
                              textDecoration: isHttpUrl ? 'underline' : undefined,
                            }}
                            title={tooltip}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isHttpUrl && !e.shiftKey) {
                                window.open(text, '_blank', 'noopener,noreferrer');
                              } else {
                                navigator.clipboard?.writeText(text).catch(() => {});
                              }
                            }}
                          >
                            ↗ {text}
                          </div>
                        );
                      };
                      return (
                        <>
                          {/* Primary (custom domain when present, otherwise default).
                          Sits ABOVE the secondary so the custom domain is visually
                          prominent. */}
                          {renderUrlRow(primaryOutputText, '#22c55e', secondaryOutputText ? 18 : 4)}
                          {/* Secondary (firebase / provider default URL) — dimmer, below */}
                          {secondaryOutputText && renderUrlRow(secondaryOutputText, 'var(--ice-text-3, #94a3b8)', 4)}
                        </>
                      );
                    })()}

                  {isError && deployError && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 8,
                        right: 8,
                        bottom: 4,
                        fontSize: 10,
                        color: '#ef4444',
                        fontFamily: FONT_MONO,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={deployError}
                    >
                      ✗ {deployError}
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: 4, right: 4 }}>
                    <FoldButton folded={false} onClick={onToggleFold} opacity={isHovered ? 0.7 : 0} />
                  </div>
                </>
              )}

              {validationSeverity && validationSeverity !== 'info' && (
                <div style={{ position: 'absolute', top: -2, right: -2 }}>
                  <ValidationBadge severity={validationSeverity} count={validationCount} small={folded} />
                </div>
              )}
            </div>
          </div>
        </foreignObject>

        {(isHovered || isValidTarget) && (
          <ConnectionPorts
            nodeId={node.id}
            x={x}
            y={y}
            width={W}
            height={H}
            color={categoryGlow}
            isValidTarget={isValidTarget}
          />
        )}
      </g>
    );
  },
);

CompactLod3.displayName = 'CompactLod3';
