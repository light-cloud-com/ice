/**
 * Connection Type Popover
 *
 * Appears at edge midpoint after a new connection is drawn.
 * Lets the user set relationship type, protocol, and port.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

export interface ConnectionConfig {
  relationship: 'connects_to' | 'depends_on';
  protocol?: string;
  port?: string;
}

interface ConnectionTypePopoverProps {
  /** Screen-space position (clientX/clientY) for popover placement */
  position: { x: number; y: number };
  /** Called when user confirms or dismisses */
  onConfirm: (config: ConnectionConfig) => void;
  onDismiss: () => void;
}

const RELATIONSHIP_OPTIONS = [
  { value: 'connects_to' as const, label: 'Connects to', color: '#22c55e' },
  { value: 'depends_on' as const, label: 'Depends on', color: '#f59e0b' },
];

const PROTOCOL_OPTIONS = ['HTTP', 'HTTPS', 'gRPC', 'TCP', 'UDP', 'WebSocket'];

export const ConnectionTypePopover: React.FC<ConnectionTypePopoverProps> = ({ position, onConfirm, onDismiss }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [relationship, setRelationship] = useState<'connects_to' | 'depends_on'>('connects_to');
  const [protocol, setProtocol] = useState('');
  const [port, setPort] = useState('');

  const handleConfirm = useCallback(() => {
    onConfirm({
      relationship,
      protocol: protocol || undefined,
      port: port || undefined,
    });
  }, [relationship, protocol, port, onConfirm]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'Enter') handleConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [relationship, protocol, port, handleConfirm, onDismiss]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Delay to avoid catching the mouseup that created this popover
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: position.x - 110,
        top: position.y + 12,
        width: 220,
        background: 'var(--ice-bg-base)',
        border: '1px solid var(--ice-border-strong)',
        borderRadius: 10,
        padding: 12,
        zIndex: 10000,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        fontFamily: "'JetBrains Mono Variable', monospace",
        fontSize: 12,
        color: 'var(--ice-text-primary)',
      }}
    >
      {/* Relationship type */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ice-text-secondary)',
            marginBottom: 4,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Relationship
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRelationship(opt.value)}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 6,
                border: `1px solid ${relationship === opt.value ? opt.color : 'var(--ice-border)'}`,
                background: relationship === opt.value ? `${opt.color}1a` : 'var(--ice-bg-raised)',
                color: relationship === opt.value ? opt.color : 'var(--ice-text-tertiary)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Protocol */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ice-text-secondary)',
            marginBottom: 4,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Protocol
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {PROTOCOL_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => setProtocol(protocol === p ? '' : p)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${protocol === p ? '#3b82f6' : 'var(--ice-border)'}`,
                background: protocol === p ? '#3b82f61a' : 'var(--ice-bg-raised)',
                color: protocol === p ? '#60a5fa' : 'var(--ice-text-secondary)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500,
                transition: 'all 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Port */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 10,
            color: 'var(--ice-text-secondary)',
            marginBottom: 4,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Port
        </div>
        <input
          type="text"
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 5432"
          style={{
            width: '100%',
            padding: '5px 8px',
            borderRadius: 6,
            border: '1px solid var(--ice-border)',
            background: 'var(--ice-bg-surface)',
            color: 'var(--ice-text-primary)',
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3b82f6';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--ice-border)';
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onDismiss}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: 6,
            border: '1px solid var(--ice-border)',
            background: 'var(--ice-bg-raised)',
            color: 'var(--ice-text-tertiary)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          Skip
        </button>
        <button
          onClick={handleConfirm}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: 6,
            border: '1px solid #3b82f6',
            background: '#3b82f6',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default ConnectionTypePopover;
