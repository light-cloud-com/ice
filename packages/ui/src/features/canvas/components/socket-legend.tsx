/**
 * Socket legend (CCL6).
 *
 * The canvas encodes a port's connection category in BOTH the socket's shape
 * and colour (see `ROLE_SHAPE` / `ROLE_CATEGORY` in @ice/types and
 * `CATEGORY_COLORS` in @ice/constants), but nothing decoded that visual language
 * for the user — first-timers had no way to learn that a diamond means a source
 * repo or a square means a domain. This renders that key.
 *
 * Kept in sync with the real maps by sourcing the colours from `CATEGORY_COLORS`
 * and mirroring `ROLE_SHAPE` (square=domain, diamond=repository, ring=config,
 * circle=traffic/data — the default).
 */

import { CATEGORY_COLORS } from '@ice/constants';
import React from 'react';
import { t } from '../../../i18n';

type Shape = 'circle' | 'ring' | 'diamond' | 'square';

const LEGEND: { shape: Shape; color: string; labelKey: string }[] = [
  { shape: 'circle', color: CATEGORY_COLORS.traffic, labelKey: 'canvas.socketLegend.traffic' },
  { shape: 'ring', color: CATEGORY_COLORS.config, labelKey: 'canvas.socketLegend.config' },
  { shape: 'diamond', color: CATEGORY_COLORS.pipeline, labelKey: 'canvas.socketLegend.repository' },
  { shape: 'square', color: CATEGORY_COLORS.dns, labelKey: 'canvas.socketLegend.domain' },
];

/** A 12×12 glyph mirroring the canvas socket shapes. */
export const SocketGlyph: React.FC<{ shape: Shape; color: string }> = ({ shape, color }) => (
  <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" data-shape={shape}>
    {shape === 'circle' && <circle cx={6} cy={6} r={4.5} fill={color} />}
    {shape === 'ring' && <circle cx={6} cy={6} r={3.5} fill="none" stroke={color} strokeWidth={2.5} />}
    {shape === 'diamond' && <rect x={2} y={2} width={8} height={8} rx={1} fill={color} transform="rotate(45 6 6)" />}
    {shape === 'square' && <rect x={1.5} y={1.5} width={9} height={9} rx={1.5} fill={color} />}
  </svg>
);

export const SocketLegend: React.FC = () => (
  <div data-testid="socket-legend">
    <div className="text-ice-2xs font-semibold uppercase tracking-wider text-ice-text-3 mb-1.5">
      {t('canvas.socketLegend.title')}
    </div>
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {LEGEND.map((row) => (
        <div key={row.shape} className="flex items-center gap-2 text-ice-2xs text-ice-text-2">
          <span className="inline-flex w-3.5 justify-center shrink-0">
            <SocketGlyph shape={row.shape} color={row.color} />
          </span>
          {t(row.labelKey)}
        </div>
      ))}
    </div>
  </div>
);
