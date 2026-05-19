import React, { memo } from 'react';

interface TableStripesProps {
  /** Accent color used for the column ticks + first stripe edge. */
  color: string;
  /** Number of horizontal stripes — defaults to 3 (the "tables" trio). */
  rows?: number;
}

/**
 * Decorative SVG that suggests "rows of relational tables" without
 * claiming specific table names. Used by postgres + mysql canvas blocks
 * as the body visual, distinguishing them from document stores like
 * mongodb (which uses `DocumentPills` instead).
 *
 * The shape encodes the relational nature visually: stacked horizontal
 * bands with internal column ticks. Real table names live in the
 * database itself; this is purely identity-cueing decoration.
 */
export const TableStripes: React.FC<TableStripesProps> = memo(({ color, rows = 3 }) => {
  const width = 100;
  const height = 100;
  const rowGap = 4;
  const rowHeight = (height - rowGap * (rows - 1)) / rows;
  const cols = 6;
  const colGap = width / (cols + 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ display: 'block', flex: 1 }}
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, i) => {
        const y = i * (rowHeight + rowGap);
        return (
          <g key={i}>
            <rect
              x={0}
              y={y}
              width={width}
              height={rowHeight}
              rx={2}
              fill={`${color}10`}
              stroke={`${color}30`}
              strokeWidth={0.5}
            />
            {Array.from({ length: cols }).map((_, c) => {
              const cx = (c + 1) * colGap;
              return (
                <line
                  key={c}
                  x1={cx}
                  y1={y + 2}
                  x2={cx}
                  y2={y + rowHeight - 2}
                  stroke={`${color}40`}
                  strokeWidth={0.6}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});

TableStripes.displayName = 'TableStripes';
