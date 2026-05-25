/**
 * SocketHoverTooltip — instant styled chip that follows the cursor when
 * the user hovers a typed socket dot.
 *
 * Mounted once at the canvas level (alongside ConnectionTooltip). Uses
 * document-level event delegation: listens for `mouseover`/`mouseout`
 * on the SVG and reads the socket's `data-socket-label` +
 * `data-category` + `data-direction` attributes. Keeps `<TypedSockets>`
 * a pure render-only component — no hooks, no React state inside the
 * SVG tree — which preserves the existing "call as function" test
 * pattern and avoids re-rendering 25 blocks on every hover.
 *
 * Why this rather than the native `<title>` element: the browser's
 * built-in tooltip has a ~1s show delay and is locked to OS chrome
 * styling. With sockets the user is rapidly scanning what each dot
 * means; the chip needs to appear instantly and read in the same
 * monospace voice as the rest of the canvas.
 */

import { CATEGORY_COLORS, type ConnectionCategory } from '@ice/constants';
import React, { useEffect, useRef, useState } from 'react';
import { CATEGORY_STYLE } from '../../../../../config/canvas-constants';

interface SocketHoverInfo {
  label: string;
  category: ConnectionCategory;
  direction: 'in' | 'out';
  peerStyle?: string;
  clientX: number;
  clientY: number;
}

export const SocketHoverTooltip: React.FC = () => {
  const [info, setInfo] = useState<SocketHoverInfo | null>(null);
  const lastTargetRef = useRef<Element | null>(null);

  useEffect(() => {
    const onOver = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      if (!target) return;
      const socket = target.closest<SVGElement>('.connection-port[data-socket-label]');
      if (!socket) return;
      const label = socket.getAttribute('data-socket-label') ?? '';
      if (!label) return; // LOD-degraded anonymous dots emit empty labels
      const category = (socket.getAttribute('data-category') as ConnectionCategory | null) ?? 'traffic';
      const direction = (socket.getAttribute('data-direction') as 'in' | 'out' | null) ?? 'in';
      const peerStyle = socket.getAttribute('data-peer-style') ?? undefined;
      lastTargetRef.current = socket;
      setInfo({ label, category, direction, peerStyle, clientX: e.clientX, clientY: e.clientY });
    };
    const onMove = (e: MouseEvent): void => {
      // Move the tooltip with the cursor while still over the same socket.
      if (
        lastTargetRef.current &&
        (e.target as Element | null)?.closest('.connection-port') === lastTargetRef.current
      ) {
        setInfo((prev) => (prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : prev));
      }
    };
    const onOut = (e: MouseEvent): void => {
      const related = (e.relatedTarget as Element | null)?.closest?.('.connection-port[data-socket-label]') ?? null;
      if (related !== lastTargetRef.current) {
        lastTargetRef.current = null;
        setInfo(null);
      }
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  if (!info) return null;

  const color = (info.peerStyle && CATEGORY_STYLE[info.peerStyle]?.glow) || CATEGORY_COLORS[info.category];
  const arrow = info.direction === 'in' ? '←' : '→';

  return (
    <div
      data-testid="socket-hover-tooltip"
      style={{
        position: 'fixed',
        left: info.clientX + 12,
        top: info.clientY + 12,
        zIndex: 1000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'var(--ice-bg-raised)',
        border: '1px solid var(--ice-border)',
        boxShadow: '0 2px 8px -2px rgba(0,0,0,0.18)',
        fontFamily: "ui-monospace, 'SFMono-Regular', monospace",
        fontSize: 11,
        whiteSpace: 'nowrap',
        color: 'var(--ice-text-primary)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontWeight: 600 }}>{info.label}</span>
      <span style={{ color: 'var(--ice-text-tertiary)' }}>{arrow}</span>
      <span style={{ color: 'var(--ice-text-tertiary)', textTransform: 'lowercase' }}>{info.category}</span>
    </div>
  );
};
