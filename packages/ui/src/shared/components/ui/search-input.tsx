import { Search, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../utils/cn';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = 'Search...', size = 'sm', className, id, autoFocus, onKeyDown }, ref) => {
    const isMd = size === 'md';

    return (
      <div className={cn('relative', className)}>
        <Search
          className={cn(
            'absolute left-2 top-1/2 -translate-y-1/2 text-ice-text-3 pointer-events-none',
            isMd ? 'w-3.5 h-3.5' : 'w-3 h-3',
          )}
        />
        <input
          ref={ref}
          id={id}
          type="text"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-md border border-ice-border text-ice-text-1 placeholder:text-ice-text-3',
            'bg-white/[0.06] focus:outline-none focus:bg-white/[0.10] focus:border-ice-border-strong transition-colors',
            isMd ? 'pl-8 pr-8 py-2 text-ice-base' : 'pl-6 pr-7 py-1 text-ice-base',
          )}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-ice-active"
          >
            <X className="w-3 h-3 text-ice-text-3" />
          </button>
        )}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';

export { SearchInput };
