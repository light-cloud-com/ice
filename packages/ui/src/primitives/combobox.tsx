/**
 * Combobox — Searchable dropdown select
 *
 * Plain HTML implementation with text filter, keyboard navigation (↑/↓/Enter/Esc),
 * and portal rendering to avoid z-index clipping inside SVG foreignObjects.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface ComboboxProps {
  value: string;
  options: ComboboxOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  emptyText?: string;
  className?: string;
  compact?: boolean;
}

export const Combobox: React.FC<ComboboxProps> = ({
  value,
  options,
  onSelect,
  placeholder = 'Search...',
  loading = false,
  emptyText = 'No results',
  className = '',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.description && o.description.toLowerCase().includes(q)),
    );
  }, [options, query]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Also check portal dropdown
        const portal = document.getElementById('ice-combobox-portal');
        if (portal && portal.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (val: string) => {
      onSelect(val);
      setOpen(false);
      setQuery('');
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[activeIndex]) {
            handleSelect(filtered[activeIndex].value);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setQuery('');
          break;
      }
    },
    [open, filtered, activeIndex, handleSelect],
  );

  // Position the dropdown using portal
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label || '';
  const h = compact ? 'h-6' : 'h-7';
  const textSize = compact ? 'text-ice-xs' : 'text-ice-sm';

  // Ensure portal container exists
  useEffect(() => {
    if (!document.getElementById('ice-combobox-portal')) {
      const el = document.createElement('div');
      el.id = 'ice-combobox-portal';
      document.body.appendChild(el);
    }
  }, []);

  const dropdown = open
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 220),
            zIndex: 99999,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            ref={listRef}
            className="bg-ice-overlay border border-ice-border rounded-md shadow-xl max-h-[200px] overflow-y-auto"
          >
            {loading && <div className={`px-3 py-2 ${textSize} text-ice-text-3`}>Loading...</div>}
            {!loading && filtered.length === 0 && (
              <div className={`px-3 py-2 ${textSize} text-ice-text-3`}>{emptyText}</div>
            )}
            {!loading &&
              filtered.map((opt, i) => (
                <div
                  key={opt.value}
                  className={`px-3 py-1.5 cursor-pointer transition-colors ${
                    i === activeIndex ? 'bg-blue-600/30' : 'hover:bg-ice-hover'
                  } ${opt.value === value ? 'text-blue-400' : 'text-ice-text-1'}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelect(opt.value);
                  }}
                >
                  <div className={`${textSize} font-medium truncate`}>{opt.label}</div>
                  {opt.description && (
                    <div className="text-ice-2xs text-ice-text-3 truncate mt-0.5">
                      {opt.description}
                      {opt.badge && (
                        <span className="ml-1.5 text-[8px] bg-ice-raised text-ice-text-2 px-1 py-0 rounded">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                  )}
                  {!opt.description && opt.badge && (
                    <span className="text-[8px] bg-ice-raised text-ice-text-2 px-1 py-0 rounded">{opt.badge}</span>
                  )}
                </div>
              ))}
          </div>
        </div>,
        document.getElementById('ice-combobox-portal') || document.body,
      )
    : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className={`w-full ${h} bg-ice-overlay/50 border border-ice-border rounded px-2 ${textSize} text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3`}
        placeholder={value ? selectedLabel : placeholder}
        value={open ? query : value ? selectedLabel : ''}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      {/* Clear button */}
      {value && !open && (
        <button
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-ice-text-3 hover:text-ice-text-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onSelect('');
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M1 1l6 6M7 1l-6 6" />
          </svg>
        </button>
      )}
      {/* Chevron */}
      {!value && !open && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-ice-text-3">
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 2.5l3 3 3-3" />
          </svg>
        </div>
      )}
      {dropdown}
    </div>
  );
};

export default Combobox;
