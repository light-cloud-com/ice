/**
 * Theme Picker — live theme switching panel.
 *
 * Each theme defines a complete light + dark palette.
 * Overrides CSS custom properties on :root so the entire app updates instantly.
 * Toggle with Ctrl+Shift+A or the Palette button in the app bar.
 *
 * Section / leaf splits (rf-accent series):
 *   - `./dev-accent-picker/types.ts` — ColorTheme + ThemePalette (rf-accent-1)
 *   - `./dev-accent-picker/data/themes.ts` — `T: ColorTheme[]` (12 themes,
 *     ~570 LOC, file-size exception) (rf-accent-2)
 *   - `./dev-accent-picker/utils/apply-palette.ts` — applyPalette,
 *     clearOverrides, ALL_PROPS (rf-accent-3)
 *   - `./dev-accent-picker/context.ts` — ThemePickerContext +
 *     useThemePicker (rf-accent-4)
 */

import { X, Sun, Moon, Palette } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import { ThemePickerContext } from './dev-accent-picker/context';
import { T } from './dev-accent-picker/data/themes';
import type { ColorTheme } from './dev-accent-picker/types';
import { applyPalette, clearOverrides } from './dev-accent-picker/utils/apply-palette';

// Public re-export so the canonical import path `'@ui/shared/components/dev-accent-picker'`
// continues to expose `useThemePicker` (used by app-settings.tsx).
export { useThemePicker } from './dev-accent-picker/context';

export const DevAccentPicker: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ice-theme-id');
    if (saved) {
      const theme = T.find((t) => t.id === saved);
      if (theme) {
        applyPalette(isDark ? theme.dark : theme.light);
        setActiveId(saved);
      }
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!activeId) return;
    const theme = T.find((t) => t.id === activeId);
    if (theme) applyPalette(isDark ? theme.dark : theme.light);
  }, [isDark, activeId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((theme: ColorTheme) => {
    applyPalette(document.documentElement.classList.contains('dark') ? theme.dark : theme.light);
    setActiveId(theme.id);
    localStorage.setItem('ice-theme-id', theme.id);
  }, []);

  const handleReset = useCallback(() => {
    clearOverrides();
    setActiveId(null);
  }, []);

  const panel = !open ? null : (
    <div
      className="fixed bottom-4 right-4 z-[99999] w-[360px] max-h-[80vh] rounded-lg border shadow-2xl flex flex-col overflow-hidden"
      style={{ borderColor: 'var(--ice-border)', background: 'var(--ice-bg-surface)' }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--ice-border)' }}
      >
        <Palette className="w-3.5 h-3.5" style={{ color: 'var(--ice-accent)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--ice-text-primary)' }}>
          Color Themes
        </span>
        <span className="flex items-center gap-1 ml-1 text-ice-2xs" style={{ color: 'var(--ice-text-tertiary)' }}>
          {isDark ? <Moon className="w-2.5 h-2.5" /> : <Sun className="w-2.5 h-2.5" />}
          {isDark ? 'Dark' : 'Light'}
        </span>
        <span className="flex-1" />
        <button
          onClick={handleReset}
          className="text-ice-2xs hover:opacity-100 opacity-50 transition-opacity"
          style={{ color: 'var(--ice-text-primary)' }}
        >
          Reset
        </button>
        <button
          onClick={() => setOpen(false)}
          className="p-0.5 hover:opacity-100 opacity-50 transition-opacity"
          style={{ color: 'var(--ice-text-primary)' }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {T.map((theme) => {
          const isActive = activeId === theme.id;
          const palette = isDark ? theme.dark : theme.light;
          return (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme)}
              className="w-full text-left rounded-md px-3 py-2.5 transition-colors outline-none focus-visible:ring-1"
              style={{ background: isActive ? 'var(--ice-bg-active)' : 'transparent' }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--ice-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5 shrink-0">
                  <div className="w-4 h-4 rounded-full" style={{ background: theme.preview[0] }} />
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ background: isDark ? theme.preview[1] : theme.preview[2] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--ice-text-primary)' }}>
                      {theme.name}
                    </span>
                    {isActive && (
                      <span
                        className="text-ice-2xs px-1.5 py-px rounded-full"
                        style={{ background: palette.accentMuted, color: palette.accent }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                  <span className="text-ice-2xs leading-tight" style={{ color: 'var(--ice-text-tertiary)' }}>
                    {theme.description}
                  </span>
                </div>
              </div>
              <div className="flex gap-px mt-2 h-3 rounded-sm overflow-hidden">
                <div className="flex-1" style={{ background: palette.base }} />
                <div className="flex-1" style={{ background: palette.surface }} />
                <div className="flex-1" style={{ background: palette.toolbar }} />
                <div className="flex-1" style={{ background: palette.raised }} />
                <div className="flex-1" style={{ background: palette.border }} />
                <div className="flex-[0.5]" style={{ background: palette.accent }} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 text-center shrink-0" style={{ borderTop: '1px solid var(--ice-border)' }}>
        <span className="text-ice-2xs" style={{ color: 'var(--ice-text-tertiary)', opacity: 0.5 }}>
          {T.length} themes
        </span>
      </div>
    </div>
  );

  return (
    <ThemePickerContext.Provider value={{ toggle }}>
      {children}
      {panel}
    </ThemePickerContext.Provider>
  );
};
