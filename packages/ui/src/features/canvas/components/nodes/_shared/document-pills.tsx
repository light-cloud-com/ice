import React, { memo } from 'react';

interface DocumentPillsProps {
  /** Accent color used for the pill outlines. */
  color: string;
  /** Number of pills to render — defaults to 4 (a 2x2 grid). */
  count?: number;
}

/**
 * Decorative SVG that suggests "documents in a flexible collection"
 * for mongodb-style document stores. Visually distinct from
 * `TableStripes` (rigid rectangular rows): each "document" is a
 * rounded pill with subtle interior dotted fill, laid out in a flow
 * grid. The pills carry no labels — real collection names live in the
 * database.
 */
export const DocumentPills: React.FC<DocumentPillsProps> = memo(({ color, count = 4 }) => {
  const width = 100;
  const height = 100;
  // Two rows of pills. Sizes vary subtly to hint at schemaless nature.
  const pillW = (width - 4 * 3) / 2; // ~44
  const pillH = (height - 4 * 3) / 2; // ~44
  const positions = Array.from({ length: count }).map((_, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return { x: 4 + col * (pillW + 4), y: 4 + row * (pillH + 4) };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ display: 'block', flex: 1 }}
      aria-hidden="true"
    >
      {positions.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x}
            y={p.y}
            width={pillW}
            height={pillH}
            rx={pillH / 3}
            fill={`${color}12`}
            stroke={`${color}40`}
            strokeWidth={0.7}
          />
          {/* interior "field" lines — variable count per pill, hinting at schemaless */}
          {[0.32, 0.52, 0.72].slice(0, 2 + (i % 2)).map((t, k) => (
            <line
              key={k}
              x1={p.x + 4}
              y1={p.y + pillH * t}
              x2={p.x + pillW - 4}
              y2={p.y + pillH * t}
              stroke={`${color}30`}
              strokeWidth={0.5}
              strokeDasharray="2 1.5"
            />
          ))}
        </g>
      ))}
    </svg>
  );
});

DocumentPills.displayName = 'DocumentPills';
