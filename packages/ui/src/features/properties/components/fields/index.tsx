/**
 * Field primitives shared across the properties panel sections.
 *
 * Each is a small `React.FC` with a label + a single input. They are
 * exported from one file (not a barrel re-export — the no-barrel rule
 * applies to package-level `index.ts` files, not co-located primitives
 * grouped behind a folder).
 *
 * Members:
 *   Section          — title + children wrapper
 *   TextField        — label + <input type="text">
 *   NumberField      — label + <input type="number">
 *   SelectField      — label + <IceSelect> dropdown
 *   ListField        — label + add/remove list of strings
 *   QueueListField   — label + add/remove list of QueueSpec items
 *   StepperField     — label + +/- buttons with min/max bounds
 *   PropertyLabel    — label + optional tooltip popover
 *   CustomValueInput — config-driven type/min/max/unit input
 *
 * Extracted from `properties-panel.tsx` lines 296-553 in rf-props-6.
 */

import { Info, List } from 'lucide-react';
import React from 'react';
import { t } from '../../../../i18n';
import { IceSelect } from '../../../../shared/components/ui/ice-select';
import { cn } from '../../../../shared/utils/cn';
import { type QueueSpec, parseQueue, stringifyQueue } from '../../utils/queue-spec';
import type { CustomInputConfig } from './render-property-field';

// Re-export so existing consumers (`from './fields'` / `from '../index'`) keep
// resolving the type — canonical home stays in `./render-property-field`.
export type { CustomInputConfig };

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pt-3 pb-2 px-3">
    {title && <div className="text-ice-2xs font-medium tracking-wide text-ice-text-3/50 mb-2">{title}</div>}
    <div className="space-y-1">{children}</div>
  </div>
);

// ─── Field components ───────────────────────────────────────────────────────

export const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  propKey?: string;
}> = ({ label, value, onChange, placeholder, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-prop-key={propKey}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
    />
  </div>
);

export const NumberField: React.FC<{
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  propKey?: string;
}> = ({ label, value, onChange, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      data-prop-key={propKey}
      className="w-[140px] bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors"
    />
  </div>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  propKey?: string;
}> = ({ label, value, options, onChange, propKey }) => (
  <div className="flex items-center justify-between gap-2 py-1" data-prop-key={propKey}>
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <IceSelect value={value} onChange={onChange} options={options} width="140px" />
  </div>
);

export const ListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}> = ({ label, value, onChange, placeholder, addLabel }) => (
  <div className="py-1 space-y-1.5">
    <span className="text-ice-xs text-ice-text-3">{label}</span>
    <div className="space-y-0.5">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const updated = [...value];
              updated[i] = e.target.value;
              onChange(updated);
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
          />
          <button
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-xs"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...value, ''])}
        className="text-ice-2xs text-ice-text-3/50 hover:text-ice-accent transition-colors"
      >
        + {addLabel || t('properties.addItem')}
      </button>
    </div>
  </div>
);

export const QueueListField: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}> = ({ label, value, onChange, placeholder, addLabel }) => {
  const queues = value.map(parseQueue);
  const update = (i: number, next: QueueSpec) => {
    const arr = [...value];
    arr[i] = stringifyQueue(next);
    onChange(arr);
  };
  return (
    <div className="py-1 space-y-2">
      <span className="text-ice-xs text-ice-text-3">{label}</span>
      <div className="space-y-1.5">
        {queues.map((q, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-ice-border/40 bg-ice-bg-raised/40 hover:border-ice-accent/40 transition-colors group"
          >
            {/* Queue icon */}
            <div
              className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(139,92,246,0.06))',
                border: '1px solid rgba(139,92,246,0.35)',
              }}
            >
              <List className="w-3 h-3 text-purple-300" />
            </div>
            {/* Name */}
            <input
              type="text"
              value={q.name}
              onChange={(e) => update(i, { ...q, name: e.target.value })}
              placeholder={placeholder || 'queue-name'}
              className="flex-1 min-w-0 bg-transparent text-ice-xs text-ice-text-1 font-mono outline-none placeholder:text-ice-text-3/40"
            />
            {/* FIFO toggle */}
            <button
              onClick={() => update(i, { ...q, fifo: !q.fifo })}
              title={q.fifo ? 'FIFO — ordered, exactly-once' : 'Standard — unordered, at-least-once'}
              className="flex-shrink-0 px-1.5 py-0.5 rounded text-ice-2xs font-medium transition-colors"
              style={{
                background: q.fifo ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: q.fifo ? 'rgb(196,181,253)' : 'var(--ice-text-tertiary)',
                border: `1px solid ${q.fifo ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {q.fifo ? 'FIFO' : 'Std'}
            </button>
            {/* Remove */}
            <button
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="flex-shrink-0 p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-sm opacity-0 group-hover:opacity-100"
              title="Remove queue"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...value, stringifyQueue({ name: '', fifo: false })])}
        className="w-full text-ice-2xs text-ice-text-3/60 hover:text-ice-accent transition-colors py-1.5 rounded border border-dashed border-ice-border/40 hover:border-ice-accent/40"
      >
        + {addLabel || 'Add a queue'}
      </button>
    </div>
  );
};

export const StepperField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min = 0, max = 99, onChange }) => (
  <div className="flex items-center justify-between gap-2 py-1">
    <span className="text-ice-xs text-ice-text-3 shrink-0">{label}</span>
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-5 h-5 flex items-center justify-center rounded text-ice-text-3 text-ice-xs hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center text-ice-xs text-ice-text-1 font-mono tabular-nums">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-5 h-5 flex items-center justify-center rounded text-ice-text-3 text-ice-xs hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
      >
        +
      </button>
    </div>
  </div>
);

// ─── Tooltip label ────────────────────────────────────────────────────────

export const PropertyLabel: React.FC<{ label: string; tooltip?: string }> = ({ label, tooltip }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  return (
    <span className="text-ice-xs text-ice-text-3 shrink-0 inline-flex items-center gap-1">
      {label}
      {tooltip && (
        <span
          className="relative inline-flex"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Info className="w-3 h-3 text-ice-text-3/30 hover:text-ice-text-3/60 cursor-help transition-colors" />
          {showTooltip && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-[9999] w-56 px-2 py-1.5 rounded text-ice-2xs leading-tight text-ice-text-2 bg-ice-overlay border border-ice-border shadow-lg pointer-events-none">
              {tooltip}
            </span>
          )}
        </span>
      )}
    </span>
  );
};

// ─── Custom value input (shown when 'custom' option is selected) ──────────

export const CustomValueInput: React.FC<{
  config: CustomInputConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ config, value, onChange }) => {
  const numVal = value != null ? String(value) : '';
  return (
    <div className="flex items-center gap-1.5 mt-1 ml-auto" style={{ width: '160px' }}>
      <input
        type={config.type}
        value={numVal}
        min={config.min}
        max={config.max}
        step={config.step}
        placeholder={config.placeholder}
        onChange={(e) => {
          const v = config.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value;
          onChange(v);
        }}
        className={cn(
          'flex-1 h-6 px-1.5 rounded text-ice-xs text-ice-text-1 bg-transparent',
          'border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent',
          'outline-none transition-colors placeholder:text-ice-text-3/30',
        )}
      />
      <span className="text-ice-2xs text-ice-text-3/50 shrink-0">{config.unit}</span>
    </div>
  );
};
