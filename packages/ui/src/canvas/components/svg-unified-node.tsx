/**
 * SVG Unified Node Component
 *
 * Clean, technical node design optimized for clarity:
 * - Left accent bar for instant category recognition
 * - Clear header with service icon, name, and type badge
 * - Organized content: status, properties (left), resource icon (right)
 * - Status color bar at bottom for at-a-glance health
 * - Collapsible with fold toggle chevron in header
 * - Resizable with drag handle
 */

import React, { memo, useState, useCallback } from 'react';
import type { CanvasNode } from './svg-canvas';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../assets/icons';

// =============================================================================
// Types
// =============================================================================

interface SvgUnifiedNodeProps {
  node: CanvasNode;
  isSelected: boolean;
  childNodes?: CanvasNode[];
  viewLevel?: number;
  onToggleFold?: (nodeId: string) => void;
  onResize?: (nodeId: string, width: number, height: number) => void;
}

// =============================================================================
// Visual Configuration
// =============================================================================

// Category colors — distinctive header tints and accent colors per category
const CATEGORY_COLORS: Record<
  string,
  { bg: string; headerBg: string; border: string; accent: string; text: string }
> = {
  Application: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#132844',
    border: '#1e3a5f',
    accent: '#3b82f6',
    text: '#93c5fd',
  },
  Database: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#1c1540',
    border: '#2d1f5e',
    accent: '#8b5cf6',
    text: '#c4b5fd',
  },
  Storage: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#0f2820',
    border: '#1a4035',
    accent: '#10b981',
    text: '#6ee7b7',
  },
  Network: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#1f1430',
    border: '#3b1e48',
    accent: '#ec4899',
    text: '#f9a8d4',
  },
  Security: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#231c0e',
    border: '#3d2f1a',
    accent: '#f59e0b',
    text: '#fcd34d',
  },
  Messaging: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#161840',
    border: '#252660',
    accent: '#6366f1',
    text: '#a5b4fc',
  },
  Monitoring: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#1a1f28',
    border: '#2a3040',
    accent: '#64748b',
    text: '#94a3b8',
  },
  Block: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#141e30',
    border: '#253548',
    accent: '#3b82f6',
    text: '#93c5fd',
  },
  default: {
    bg: 'var(--ice-bg-surface)',
    headerBg: '#1a1f28',
    border: '#2a3040',
    accent: '#475569',
    text: '#94a3b8',
  },
};

// Type badge configuration
const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  // Blocks
  'Block.StaticSite': { label: 'Frontend', color: '#3b82f6' },
  'Block.ScalableBackend': { label: 'Backend', color: '#22c55e' },
  'Block.Worker': { label: 'Worker', color: '#a855f7' },
  'Block.Database': { label: 'Database', color: '#f97316' },
  'Block.Cache': { label: 'Cache', color: '#06b6d4' },
  'Block.Storage': { label: 'Storage', color: '#06b6d4' },
  'Block.Gateway': { label: 'Gateway', color: '#ec4899' },
  'Block.Queue': { label: 'Queue', color: '#6366f1' },
  'Block.ServerlessFunction': { label: 'Function', color: '#8b5cf6' },
  'Block.ScheduledTask': { label: 'Scheduled', color: '#eab308' },
  'Block.Logs': { label: 'Logs', color: '#64748b' },
  // Network
  'Network.VPC': { label: 'VPC', color: '#6366f1' },
  'Network.Subnet': { label: 'Subnet', color: '#8b5cf6' },
  'Network.LoadBalancer': { label: 'LB', color: '#ec4899' },
  'Network.Gateway': { label: 'Gateway', color: '#ec4899' },
  'Network.APIGateway': { label: 'API GW', color: '#ec4899' },
  // Compute
  'Application.Container': { label: 'Container', color: '#3b82f6' },
  'Application.Function': { label: 'Function', color: '#8b5cf6' },
  'Application.VM': { label: 'VM', color: '#64748b' },
  // Databases
  'Database.PostgreSQL': { label: 'Postgres', color: '#336791' },
  'Database.MySQL': { label: 'MySQL', color: '#00758f' },
  'Database.MongoDB': { label: 'Mongo', color: '#47a248' },
  'Database.Redis': { label: 'Redis', color: '#dc382d' },
  // Storage
  'Storage.Bucket': { label: 'Bucket', color: '#10b981' },
  // Messaging
  'Messaging.Queue': { label: 'Queue', color: '#6366f1' },
  'Messaging.Topic': { label: 'Topic', color: '#6366f1' },
};

// Status colors
const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  deploying: '#3b82f6',
  degraded: '#eab308',
  stopped: '#6b7280',
  failed: '#ef4444',
  unknown: '#6b7280',
};

// Provider labels
const PROVIDER_CONFIG: Record<string, { color: string; label: string }> = {
  aws: { color: '#ff9900', label: 'AWS' },
  gcp: { color: '#4285f4', label: 'GCP' },
  azure: { color: '#0078d4', label: 'Azure' },
  kubernetes: { color: '#326ce5', label: 'K8s' },
  k8s: { color: '#326ce5', label: 'K8s' },
};

// Extract key properties based on resource type
function getKeyProperties(
  data: Record<string, unknown>,
  _iceType: string
): Array<{ label: string; value: string }> {
  const props: Array<{ label: string; value: string }> = [];

  const propertyPriority = [
    { key: 'region', label: 'Region' },
    { key: 'zone', label: 'Zone' },
    { key: 'location', label: 'Location' },
    { key: 'instanceType', label: 'Type' },
    { key: 'machineType', label: 'Type' },
    { key: 'tier', label: 'Tier' },
    { key: 'size', label: 'Size' },
    { key: 'engine', label: 'Engine' },
    { key: 'version', label: 'Version' },
    { key: 'databaseVersion', label: 'Version' },
    { key: 'runtime', label: 'Runtime' },
    { key: 'memory', label: 'Memory' },
    { key: 'cpu', label: 'CPU' },
    { key: 'replicas', label: 'Replicas' },
    { key: 'cidrBlock', label: 'CIDR' },
    { key: 'ipCidrRange', label: 'CIDR' },
    { key: 'state', label: 'State' },
    { key: 'status', label: 'Status' },
  ];

  for (const { key, label } of propertyPriority) {
    if (props.length >= 3) break;
    const value = data[key];
    if (value !== undefined && value !== null && value !== '') {
      const strValue = String(value);
      if (strValue.length <= 20) {
        props.push({ label, value: strValue });
      }
    }
  }

  return props;
}

// =============================================================================
// Component
// =============================================================================

export const SvgUnifiedNode: React.FC<SvgUnifiedNodeProps> = memo(
  ({
    node,
    isSelected,
    childNodes = [],
    viewLevel: _viewLevel = 1,
    onToggleFold,
    onResize: _onResize,
  }) => {
    const { x, y, width, height, data, label } = node;
    const [isHovered, setIsHovered] = useState(false);
    const [localFolded, setLocalFolded] = useState(false);

    // Extract node data
    const iceType = (data.iceType as string) || '';
    const category = iceType.split('.')[0] || 'default';
    const status = (data.status as string) || 'active';
    const behavior = (data.behavior as string) || 'singleton';
    const isContainer =
      behavior === 'container' ||
      iceType.startsWith('Network.VPC') ||
      iceType.startsWith('Network.Subnet');
    const isAggregated = (data.isAggregated as boolean) || false;
    const resourceIds = (data.resourceIds as string[]) || [];
    const provider = (data.provider as string) || '';

    const folded = isAggregated ? localFolded : (data.folded as boolean) || false;
    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
    const typeBadge = TYPE_BADGES[iceType] || { label: category, color: colors.accent };

    // Type-aware default sizing — blocks are larger than resources
    const isBlock = iceType.startsWith('Block.') || node.type === 'block';
    const defaultWidth = isBlock ? 300 : 280;
    const defaultHeight = isBlock ? 180 : 170;

    // Dimensions
    const headerHeight = 36;
    const cornerRadius = 8;
    const accentWidth = 3;
    const nodeWidth = Math.max(width || defaultWidth, 220);
    const nodeHeight = folded ? headerHeight : Math.max(height || defaultHeight, 120);

    // Badge sizing — adapts to label length
    const badgeText = typeBadge.label;
    const badgeWidth = Math.max(badgeText.length * 6.5 + 12, 40);
    const badgeX = x + nodeWidth - badgeWidth - 8;

    // Title truncation based on available space
    const titleSpace = nodeWidth - 40 - badgeWidth - 32;
    const titleMaxChars = Math.max(Math.floor(titleSpace / 7), 8);
    const displayLabel =
      (label || '').length > titleMaxChars
        ? (label || '').substring(0, titleMaxChars) + '\u2026'
        : label || '';

    // Icon URL
    const iconUrl =
      getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider)?.icon || DEFAULT_ICON;

    // Key properties
    const properties = getKeyProperties(data, iceType);

    // Handle fold toggle
    const handleToggleFold = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isAggregated) {
          setLocalFolded(!localFolded);
        } else {
          onToggleFold?.(node.id);
        }
      },
      [isAggregated, localFolded, node.id, onToggleFold]
    );

    const [isResizing] = useState(false);

    return (
      <g
        className="svg-unified-node"
        data-node-id={node.id}
        style={{ cursor: isResizing ? 'se-resize' : 'move' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Defs: clip path for accent bar + status bar, shadow filter */}
        <defs>
          <clipPath id={`clip-${node.id}`}>
            <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx={cornerRadius} />
          </clipPath>
          <filter id={`glow-${node.id}`} x="-15%" y="-15%" width="130%" height="140%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="6"
              floodColor={colors.accent}
              floodOpacity="0.25"
            />
          </filter>
        </defs>

        {/* Selection ring */}
        {isSelected && (
          <rect
            x={x - 2}
            y={y - 2}
            width={nodeWidth + 4}
            height={nodeHeight + 4}
            rx={cornerRadius + 2}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
          />
        )}

        {/* Main card background */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={nodeHeight}
          rx={cornerRadius}
          fill={colors.bg}
          stroke={isSelected ? '#3b82f6' : isHovered ? colors.accent : colors.border}
          strokeWidth={isSelected ? 1.5 : 1}
          filter={isHovered ? `url(#glow-${node.id})` : undefined}
        />

        {/* Header background (clipped to card shape for rounded top corners) */}
        <rect
          x={x}
          y={y}
          width={nodeWidth}
          height={headerHeight}
          fill={colors.headerBg}
          clipPath={`url(#clip-${node.id})`}
        />

        {/* Left accent bar (drawn on top, clipped to card shape) */}
        <rect
          x={x}
          y={y}
          width={accentWidth}
          height={nodeHeight}
          fill={colors.accent}
          clipPath={`url(#clip-${node.id})`}
        />

        {/* Header separator line */}
        {!folded && (
          <line
            x1={x + accentWidth}
            y1={y + headerHeight}
            x2={x + nodeWidth}
            y2={y + headerHeight}
            stroke={colors.border}
            strokeWidth={0.5}
            opacity={0.5}
          />
        )}

        {/* Service icon in header */}
        <image
          x={x + 12}
          y={y + 8}
          width={20}
          height={20}
          href={iconUrl}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#clip-${node.id})`}
        />

        {/* Title text — left-aligned, larger, more readable */}
        <text
          x={x + 38}
          y={y + 19}
          dominantBaseline="middle"
          fill="var(--ice-text-primary)"
          fontSize="13"
          fontWeight="600"
          fontFamily="'JetBrains Mono Variable', monospace"
          style={{ pointerEvents: 'none' }}
        >
          {displayLabel}
        </text>

        {/* Fold toggle chevron */}
        <g
          style={{ cursor: 'pointer' }}
          onClick={handleToggleFold}
          opacity={isHovered ? 0.8 : 0.35}
        >
          <rect x={badgeX - 22} y={y + 8} width={18} height={20} fill="transparent" />
          {folded ? (
            <path
              d={`M ${badgeX - 16} ${y + 14} l 5 4 -5 4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d={`M ${badgeX - 17} ${y + 16} l 4 4 4 -4`}
              fill="none"
              stroke="var(--ice-text-tertiary)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>

        {/* Type badge pill */}
        <rect
          x={badgeX}
          y={y + 10}
          width={badgeWidth}
          height={16}
          rx={4}
          fill={`${typeBadge.color}18`}
          stroke={typeBadge.color}
          strokeWidth={0.5}
        />
        <text
          x={badgeX + badgeWidth / 2}
          y={y + 18}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={typeBadge.color}
          fontSize="9"
          fontWeight="600"
          fontFamily="'JetBrains Mono Variable', monospace"
        >
          {badgeText}
        </text>

        {/* ============================================================= */}
        {/* Content area — only when expanded                              */}
        {/* ============================================================= */}
        {!folded && (
          <g className="content-area">
            {/* Right column: resource icon + provider badge */}
            <g className="icons-right">
              <image
                x={x + nodeWidth - 54}
                y={y + headerHeight + 12}
                width={40}
                height={40}
                href={iconUrl}
                preserveAspectRatio="xMidYMid meet"
                opacity={0.55}
              />

              {provider && PROVIDER_CONFIG[provider.toLowerCase()] && (
                <g>
                  <rect
                    x={x + nodeWidth - 52}
                    y={y + headerHeight + 58}
                    width={36}
                    height={16}
                    rx={4}
                    fill={PROVIDER_CONFIG[provider.toLowerCase()].color}
                    opacity={0.15}
                  />
                  <text
                    x={x + nodeWidth - 34}
                    y={y + headerHeight + 66}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={PROVIDER_CONFIG[provider.toLowerCase()].color}
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="'JetBrains Mono Variable', monospace"
                  >
                    {PROVIDER_CONFIG[provider.toLowerCase()].label}
                  </text>
                </g>
              )}
            </g>

            {/* Left column: status + properties */}
            <g className="properties-left">
              {/* Status indicator */}
              <circle
                cx={x + 16}
                cy={y + headerHeight + 18}
                r={4}
                fill={STATUS_COLORS[status] || STATUS_COLORS.unknown}
              />
              <text
                x={x + 27}
                y={y + headerHeight + 18}
                dominantBaseline="middle"
                fill={STATUS_COLORS[status] || STATUS_COLORS.unknown}
                fontSize="11"
                fontWeight="500"
                fontFamily="'JetBrains Mono Variable', monospace"
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </text>

              {/* Subtle divider below status */}
              <line
                x1={x + 14}
                y1={y + headerHeight + 30}
                x2={x + nodeWidth - 64}
                y2={y + headerHeight + 30}
                stroke={colors.border}
                strokeWidth={0.5}
                opacity={0.3}
              />

              {/* Key properties — 11px, 20px row spacing */}
              {properties.map((prop, i) => (
                <g key={prop.label}>
                  <text
                    x={x + 14}
                    y={y + headerHeight + 46 + i * 20}
                    dominantBaseline="middle"
                    fill="var(--ice-text-secondary)"
                    fontSize="11"
                    fontFamily="'JetBrains Mono Variable', monospace"
                  >
                    {prop.label}
                  </text>
                  <text
                    x={x + 72}
                    y={y + headerHeight + 46 + i * 20}
                    dominantBaseline="middle"
                    fill="var(--ice-text-primary)"
                    fontSize="11"
                    fontWeight="500"
                    fontFamily="ui-monospace, 'SFMono-Regular', monospace"
                  >
                    {prop.value}
                  </text>
                </g>
              ))}
            </g>

            {/* ICE type label — bottom left, monospace */}
            <text
              x={x + 14}
              y={y + nodeHeight - 16}
              dominantBaseline="middle"
              fill="var(--ice-border-strong)"
              fontSize="9"
              fontFamily="ui-monospace, 'SFMono-Regular', monospace"
            >
              {iceType}
            </text>

            {/* Resource count for aggregated blocks */}
            {isAggregated && resourceIds.length > 0 && (
              <g>
                <rect
                  x={x + 14}
                  y={y + nodeHeight - 38}
                  width={nodeWidth - 72}
                  height={18}
                  rx={4}
                  fill={colors.accent}
                  opacity={0.08}
                />
                <text
                  x={x + 22}
                  y={y + nodeHeight - 29}
                  dominantBaseline="middle"
                  fill={colors.text}
                  fontSize="10"
                  fontWeight="500"
                  fontFamily="'JetBrains Mono Variable', monospace"
                >
                  {resourceIds.length} resource{resourceIds.length !== 1 ? 's' : ''}
                </text>
              </g>
            )}

            {/* Container indicator */}
            {isContainer && !isAggregated && childNodes.length > 0 && (
              <g>
                <rect
                  x={x + 14}
                  y={y + nodeHeight - 38}
                  width={nodeWidth - 72}
                  height={18}
                  rx={4}
                  fill={colors.accent}
                  opacity={0.08}
                />
                <text
                  x={x + 22}
                  y={y + nodeHeight - 29}
                  dominantBaseline="middle"
                  fill="var(--ice-text-secondary)"
                  fontSize="10"
                  fontFamily="'JetBrains Mono Variable', monospace"
                >
                  {childNodes.length} nested
                </text>
              </g>
            )}

            {/* Status bar at bottom — 2px colored strip */}
            <rect
              x={x}
              y={y + nodeHeight - 2}
              width={nodeWidth}
              height={2}
              fill={STATUS_COLORS[status] || STATUS_COLORS.unknown}
              opacity={0.6}
              clipPath={`url(#clip-${node.id})`}
            />

            {/* Resize handle */}
            <g className="resize-handle" style={{ cursor: 'se-resize' }}>
              <rect
                x={x + nodeWidth - 16}
                y={y + nodeHeight - 16}
                width={16}
                height={16}
                fill="transparent"
              />
              <line
                x1={x + nodeWidth - 4}
                y1={y + nodeHeight - 10}
                x2={x + nodeWidth - 10}
                y2={y + nodeHeight - 4}
                stroke={isHovered ? colors.accent : 'var(--ice-border-strong)'}
                strokeWidth={1}
              />
              <line
                x1={x + nodeWidth - 4}
                y1={y + nodeHeight - 6}
                x2={x + nodeWidth - 6}
                y2={y + nodeHeight - 4}
                stroke={isHovered ? colors.accent : 'var(--ice-border-strong)'}
                strokeWidth={1}
              />
            </g>
          </g>
        )}

        {/* Folded state: status bar + status dot */}
        {folded && (
          <g>
            <circle
              cx={badgeX - 30}
              cy={y + 18}
              r={3}
              fill={STATUS_COLORS[status] || STATUS_COLORS.unknown}
            />
            <rect
              x={x}
              y={y + headerHeight - 2}
              width={nodeWidth}
              height={2}
              fill={STATUS_COLORS[status] || STATUS_COLORS.unknown}
              opacity={0.6}
              clipPath={`url(#clip-${node.id})`}
            />
          </g>
        )}
      </g>
    );
  }
);

SvgUnifiedNode.displayName = 'SvgUnifiedNode';

export default SvgUnifiedNode;
