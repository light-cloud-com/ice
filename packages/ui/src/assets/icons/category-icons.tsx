/**
 * Category Icons — Custom SVG icons for block type categories
 *
 * Geometric, monochrome stroke icons that visually identify
 * what kind of infrastructure resource a block represents.
 * Designed to embed directly in the canvas SVG (renders <g>, not <svg>).
 */

import React from 'react';

interface CategoryIconProps {
  x: number;
  y: number;
  size: number;
  color: string;
}

// ─── Shared stroke props ──────────────────────────────────────────────────

const S = {
  fill: 'none',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ─── Application (hexagonal server) ───────────────────────────────────────

const ApplicationIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20; // scale factor (icons designed at 20px)
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <rect x={3} y={2} width={14} height={16} rx={2} />
      <line x1={3} y1={7} x2={17} y2={7} />
      <circle cx={10} cy={4.5} r={0.5} fill={color} stroke="none" />
      <line x1={7} y1={12} x2={13} y2={12} />
      <line x1={7} y1={14.5} x2={13} y2={14.5} />
    </g>
  );
};

// ─── Database (stacked cylinder) ──────────────────────────────────────────

const DatabaseIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <ellipse cx={10} cy={5} rx={7} ry={3} />
      <path d="M3 5v10c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
      <path d="M3 10c0 1.66 3.13 3 7 3s7-1.34 7-3" />
    </g>
  );
};

// ─── Storage (cube/box) ───────────────────────────────────────────────────

const StorageIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <path d="M10 2L3 6v8l7 4 7-4V6z" />
      <path d="M3 6l7 4 7-4" />
      <line x1={10} y1={10} x2={10} y2={18} />
    </g>
  );
};

// ─── Network (connected nodes mesh) ───────────────────────────────────────

const NetworkIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <circle cx={10} cy={4} r={2.5} />
      <circle cx={4} cy={15} r={2.5} />
      <circle cx={16} cy={15} r={2.5} />
      <line x1={10} y1={6.5} x2={5.5} y2={13} />
      <line x1={10} y1={6.5} x2={14.5} y2={13} />
      <line x1={6.5} y1={15} x2={13.5} y2={15} />
    </g>
  );
};

// ─── Security (shield) ────────────────────────────────────────────────────

const SecurityIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <path d="M10 2L3 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
      <polyline points="7.5,10 9.5,12 13,8" />
    </g>
  );
};

// ─── Messaging (queue arrows) ─────────────────────────────────────────────

const MessagingIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <rect x={2} y={4} width={6} height={12} rx={1} />
      <rect x={12} y={4} width={6} height={12} rx={1} />
      <path d="M8 8h4l-1.5-1.5M8 8l1.5 1.5" fill="none" />
      <path d="M8 12h4l-1.5-1.5M8 12l1.5 1.5" fill="none" />
    </g>
  );
};

// ─── Monitoring (pulse/heartbeat) ─────────────────────────────────────────

const MonitoringIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <rect x={2} y={3} width={16} height={14} rx={2} />
      <polyline points="5,12 7.5,8 9.5,14 12,6 14.5,12" />
    </g>
  );
};

// ─── Analytics (bar chart) ────────────────────────────────────────────────

const AnalyticsIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <line x1={3} y1={17} x2={17} y2={17} />
      <rect x={4} y={11} width={3} height={6} rx={0.5} fill={color} opacity={0.3} />
      <rect x={8.5} y={7} width={3} height={10} rx={0.5} fill={color} opacity={0.3} />
      <rect x={13} y={3} width={3} height={14} rx={0.5} fill={color} opacity={0.3} />
    </g>
  );
};

// ─── AI (neural brain node) ───────────────────────────────────────────────

const AIIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <circle cx={10} cy={10} r={3} />
      <circle cx={4} cy={5} r={1.5} />
      <circle cx={16} cy={5} r={1.5} />
      <circle cx={4} cy={15} r={1.5} />
      <circle cx={16} cy={15} r={1.5} />
      <line x1={7.5} y1={8} x2={5.2} y2={6.2} />
      <line x1={12.5} y1={8} x2={14.8} y2={6.2} />
      <line x1={7.5} y1={12} x2={5.2} y2={13.8} />
      <line x1={12.5} y1={12} x2={14.8} y2={13.8} />
    </g>
  );
};

// ─── Source (git branch fork) ─────────────────────────────────────────────

const SourceIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <circle cx={7} cy={4} r={2} />
      <circle cx={7} cy={16} r={2} />
      <circle cx={14} cy={8} r={2} />
      <line x1={7} y1={6} x2={7} y2={14} />
      <path d="M7 8c0 0 0-2 3-2h2" />
    </g>
  );
};

// ─── Config (sliders) ─────────────────────────────────────────────────────

const ConfigIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <line x1={4} y1={5} x2={16} y2={5} />
      <line x1={4} y1={10} x2={16} y2={10} />
      <line x1={4} y1={15} x2={16} y2={15} />
      <circle cx={8} cy={5} r={1.5} fill="var(--ice-bg-surface)" />
      <circle cx={13} cy={10} r={1.5} fill="var(--ice-bg-surface)" />
      <circle cx={6} cy={15} r={1.5} fill="var(--ice-bg-surface)" />
    </g>
  );
};

// ─── Observability (eye) ──────────────────────────────────────────────────

const ObservabilityIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <path d="M2 10s3.5-6 8-6 8 6 8 6-3.5 6-8 6-8-6-8-6z" />
      <circle cx={10} cy={10} r={2.5} />
    </g>
  );
};

// ─── Scheduler (clock face) ───────────────────────────────────────────────

const SchedulerIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <circle cx={10} cy={10} r={8} />
      <polyline points="10,5 10,10 14,12" />
    </g>
  );
};

// ─── External (arrow out of box) ──────────────────────────────────────────

const ExternalIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <path d="M14 2h4v4" />
      <line x1={18} y1={2} x2={10} y2={10} />
      <path d="M16 11v5a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5" />
    </g>
  );
};

// ─── Block (generic fallback — building block) ────────────────────────────

const BlockIcon: React.FC<CategoryIconProps> = ({ x, y, size, color }) => {
  const s = size / 20;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} stroke={color} {...S}>
      <rect x={3} y={3} width={14} height={14} rx={3} />
      <line x1={3} y1={10} x2={17} y2={10} />
      <line x1={10} y1={3} x2={10} y2={10} />
    </g>
  );
};

// ─── Registry ─────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.FC<CategoryIconProps>> = {
  Application: ApplicationIcon,
  Database: DatabaseIcon,
  Storage: StorageIcon,
  Network: NetworkIcon,
  Security: SecurityIcon,
  Messaging: MessagingIcon,
  Monitoring: MonitoringIcon,
  Observability: ObservabilityIcon,
  Analytics: AnalyticsIcon,
  AI: AIIcon,
  Source: SourceIcon,
  Config: ConfigIcon,
  Scheduler: SchedulerIcon,
  External: ExternalIcon,
  Block: BlockIcon,
};

/**
 * Get the category icon component for a given iceType category prefix.
 * Falls back to BlockIcon for unknown categories.
 */
export function getCategoryIcon(category: string): React.FC<CategoryIconProps> {
  return CATEGORY_ICONS[category] || BlockIcon;
}

/**
 * Render a category icon directly as JSX (for embedding in SVG canvas).
 */
export function renderCategoryIcon(
  category: string,
  x: number,
  y: number,
  size: number,
  color: string,
): React.ReactElement {
  const Icon = getCategoryIcon(category);
  return <Icon x={x} y={y} size={size} color={color} />;
}

export type { CategoryIconProps };
