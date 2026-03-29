/**
 * Language Switch — toggles between supported locales
 */

import { Languages } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useTranslation, LOCALES } from '../../i18n';
import type { Locale } from '../../i18n';
import { cn } from '../utils/cn';

export const LanguageSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.id === locale)!;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-ice-text-2 hover:text-ice-text-1 hover:bg-ice-hover transition-colors"
        title={current.nativeLabel}
      >
        <Languages className="w-3.5 h-3.5" />
        <span className="uppercase font-medium">{locale}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 bg-ice-surface border border-ice-border rounded-md shadow-lg py-1 z-50 min-w-[140px]">
          {LOCALES.map((loc) => (
            <button
              key={loc.id}
              onClick={() => {
                setLocale(loc.id as Locale);
                setOpen(false);
              }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-ice-hover transition-colors',
                locale === loc.id ? 'text-ice-accent font-medium' : 'text-ice-text-2',
              )}
            >
              <span>{loc.nativeLabel}</span>
              <span className="text-xs text-ice-text-3 uppercase">{loc.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
