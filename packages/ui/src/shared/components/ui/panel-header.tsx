/**
 * PanelHeader — Unified header for all sidebar panels
 *
 * Consistent layout: icon | title | badge? | spacer | actions | search toggle? | close
 * Search input collapses behind a toggle icon when not focused.
 */

import { Search, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SearchInput } from './search-input';
import { cn } from '../../utils/cn';

// ─── Sub-components ────────────────────────────────────────────────────────

/** A single icon-button used in the header actions row. */
export const PanelHeaderAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: boolean;
  className?: string;
}> = ({ icon, label, onClick, active, badge, className }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={cn(
      'relative p-1 rounded transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
      active ? 'text-ice-accent' : 'text-ice-text-3/50 hover:text-ice-text-1',
      className,
    )}
  >
    {icon}
    {badge && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-ice-accent" />}
  </button>
);

// ─── Main component ────────────────────────────────────────────────────────

export interface PanelHeaderProps {
  /** Lucide icon element shown before the title */
  icon?: React.ReactNode;
  /** Panel title text */
  title: string;
  /** Optional badge / status element shown after the title */
  badge?: React.ReactNode;
  /** Optional subtitle line below the title row */
  subtitle?: React.ReactNode;
  /** Action buttons rendered between spacer and close */
  actions?: React.ReactNode;
  /** Close handler — renders close button when provided */
  onClose?: () => void;
  /** Close button aria-label */
  closeLabel?: string;
  /** Search props — when provided, shows a collapsible search input */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    /** Ref forwarded to the underlying <input> */
    ref?: React.RefObject<HTMLInputElement | null> | React.Ref<HTMLInputElement>;
    id?: string;
  };
  /** Content rendered below the title row (e.g. filter tabs, hero cost) */
  children?: React.ReactNode;
  /** Extra class on the outer wrapper */
  className?: string;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  icon,
  title,
  badge,
  subtitle,
  actions,
  onClose,
  closeLabel = 'Close',
  search,
  children,
  className,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-open search when value is non-empty (e.g. restored state)
  useEffect(() => {
    if (search?.value) setSearchOpen(true);
  }, [search?.value]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      // Small delay to let the DOM update
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchOpen]);

  const handleSearchToggle = useCallback(() => {
    if (searchOpen && search) {
      search.onChange('');
    }
    setSearchOpen((o) => !o);
  }, [searchOpen, search]);

  // Close search on Escape
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        search?.onChange('');
        setSearchOpen(false);
      }
    },
    [search],
  );

  return (
    <div className={cn('shrink-0 border-b border-ice-border bg-ice-raised', className)}>
      {/* ── Title row ── */}
      <div className="flex items-center gap-2 px-3 py-2 min-h-[36px]">
        {icon && <span className="shrink-0 flex items-center text-ice-text-3">{icon}</span>}
        <span className="text-ice-xs font-medium text-ice-text-1 uppercase tracking-wider whitespace-nowrap shrink-0">
          {title}
        </span>
        {badge}
        <span className="flex-1 min-w-0" />
        {actions}
        {search && (
          <PanelHeaderAction
            icon={<Search aria-hidden="true" className="w-3.5 h-3.5" />}
            label={searchOpen ? 'Close search' : 'Search'}
            onClick={handleSearchToggle}
            active={searchOpen || !!search.value}
          />
        )}
        {onClose && (
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="p-1 rounded text-ice-text-3/50 hover:text-ice-text-1 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <X aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Collapsible search ── */}
      {search && searchOpen && (
        <div className="px-3 pb-2">
          <SearchInput
            ref={(node) => {
              // Merge refs
              (searchInputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              if (typeof search.ref === 'function') search.ref(node);
              else if (search.ref) (search.ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
            }}
            id={search.id}
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      )}

      {/* ── Subtitle ── */}
      {subtitle && <div className="px-3 pb-2 -mt-0.5">{subtitle}</div>}

      {/* ── Extra content (filter tabs, hero cost, etc.) ── */}
      {children && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
};
