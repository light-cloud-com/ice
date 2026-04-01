/**
 * IceSelect — Clean minimal select dropdown
 *
 * Drop-in replacement for native <select> matching the ICE design language.
 * Built on Radix UI Select for accessibility, keyboard nav, and portal rendering.
 *
 * Usage:
 *   <IceSelect value={v} onChange={setV} options={[{value:'a', label:'A'}]} />
 *   <IceSelect value={v} onChange={setV} options={['a','b','c']} placeholder="Pick one" />
 *   <IceSelect value={v} onChange={setV} options={opts} size="sm" />
 */

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import React, { memo } from 'react';
import { cn } from '../../utils/cn';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IceSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface IceSelectProps {
  /** Current value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Options — array of strings or option objects */
  options: (string | IceSelectOption)[];
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Visual size variant */
  size?: 'sm' | 'md';
  /** Full width */
  fullWidth?: boolean;
  /** Fixed width (e.g. '140px', '200px') */
  width?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className on the trigger */
  className?: string;
  /** Show a "none" option at the top */
  allowEmpty?: boolean;
  /** Label for the empty option */
  emptyLabel?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_SENTINEL = '__ice_select_empty__';

function normalizeOptions(options: (string | IceSelectOption)[]): IceSelectOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

// ─── Component ──────────────────────────────────────────────────────────────

export const IceSelect: React.FC<IceSelectProps> = memo(
  ({
    value,
    onChange,
    options,
    placeholder = '\u2014',
    size = 'sm',
    fullWidth = false,
    width,
    disabled = false,
    className,
    allowEmpty = true,
    emptyLabel = '\u2014',
  }) => {
    const normalized = normalizeOptions(options);
    const selectedLabel = normalized.find((o) => o.value === value)?.label;

    const isSm = size === 'sm';

    return (
      <SelectPrimitive.Root
        value={value || undefined}
        onValueChange={(v) => onChange(v === EMPTY_SENTINEL ? '' : v)}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          className={cn(
            'group inline-flex items-center justify-between gap-1 rounded transition-colors outline-none',
            'bg-transparent text-ice-text-1',
            'border-b border-ice-border/50 hover:border-ice-text-3/50 focus-visible:border-ice-accent',
            isSm ? 'h-6 px-1 text-ice-xs' : 'h-7 px-2 text-ice-sm',
            fullWidth && 'w-full',
            disabled && 'opacity-40 pointer-events-none',
            className,
          )}
          style={width ? { width } : undefined}
        >
          <span className={cn('truncate', !selectedLabel && 'text-ice-text-3/40')}>
            <SelectPrimitive.Value placeholder={placeholder}>{selectedLabel || placeholder}</SelectPrimitive.Value>
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'shrink-0 text-ice-text-3/40 group-hover:text-ice-text-3 transition-colors',
                isSm ? 'w-3 h-3' : 'w-3.5 h-3.5',
              )}
            />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={4}
            className={cn(
              'z-[99999] max-h-[280px] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
              'rounded-md border border-ice-border bg-ice-overlay shadow-xl',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]',
              'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
            )}
          >
            <SelectPrimitive.Viewport className="p-0.5">
              {allowEmpty && (
                <SelectPrimitive.Item
                  value={EMPTY_SENTINEL}
                  className={cn(
                    'relative flex items-center rounded px-2 py-1 outline-none cursor-pointer select-none',
                    'text-ice-text-3/50 hover:text-ice-text-2 hover:bg-ice-hover',
                    isSm ? 'text-ice-xs' : 'text-ice-sm',
                  )}
                >
                  <SelectPrimitive.ItemText>{emptyLabel}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              )}
              {normalized.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    'relative flex items-center rounded px-2 outline-none cursor-pointer select-none transition-colors',
                    'text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover focus:bg-ice-hover focus:text-ice-text-1',
                    'data-[disabled]:opacity-30 data-[disabled]:pointer-events-none',
                    opt.description ? 'py-1.5' : 'py-1',
                    isSm ? 'text-ice-xs' : 'text-ice-sm',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <SelectPrimitive.ItemText>
                        <span className="truncate">{opt.label}</span>
                      </SelectPrimitive.ItemText>
                      {opt.value === value && (
                        <Check aria-hidden="true" className="w-3 h-3 shrink-0 text-blue-400" />
                      )}
                    </div>
                    {opt.description && (
                      <div className="text-[10px] text-ice-text-3/50 mt-0.5 leading-tight">{opt.description}</div>
                    )}
                  </div>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  },
);

IceSelect.displayName = 'IceSelect';
