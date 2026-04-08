/**
 * Context Menu Primitives — shared building blocks for all context menus.
 */

import React, { useEffect, useRef, useState } from 'react';

// ── Platform shortcuts ──────────────────────────────────────────────────────

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';
export function modKey(key: string): string {
  return `${MOD}${key}`;
}

export function fireKey(key: string, ctrl = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, metaKey: ctrl, bubbles: true }));
}

// ── MenuItem ────────────────────────────────────────────────────────────────

interface MenuItemProps {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const MenuItem: React.FC<MenuItemProps> = ({ label, shortcut, danger, disabled, onClick }) => (
  <button
    disabled={disabled}
    className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded ${disabled ? 'text-ice-text-3 cursor-default' : danger ? 'text-red-400 hover:bg-red-950/50' : 'text-ice-text-1 hover:bg-ice-hover'}`}
    onClick={disabled ? undefined : onClick}
  >
    <span>{label}</span>
    {shortcut && <span className="text-ice-text-3 ml-4 text-ice-xs">{shortcut}</span>}
  </button>
);

// ── Separator ───────────────────────────────────────────────────────────────

export const Separator: React.FC = () => <div className="h-px bg-ice-border-subtle my-1" />;

// ── SubMenu (controlled by parent) ─────────────────────────────────────────

export const SubMenu: React.FC<{
  label: string;
  isOpen: boolean;
  onEnter: () => void;
  onLeave: () => void;
  items: Array<{ label: string; onClick: () => void }>;
}> = ({ label, isOpen, onEnter, onLeave, items }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ x: rect.right - 4, y: rect.top });
    }
  }, [isOpen]);

  return (
    <div ref={triggerRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded text-ice-text-1 ${isOpen ? 'bg-ice-hover' : 'hover:bg-ice-hover'}`}
      >
        <span>{label}</span>
        <span className="text-ice-text-3 text-ice-xs ml-4">▸</span>
      </button>
      {isOpen && (
        <div
          className="fixed min-w-[160px] max-h-[80vh] overflow-y-auto bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1 z-[9999]"
          style={{ left: pos.x, top: pos.y }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {items.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center px-3 py-1.5 text-left text-xs rounded text-ice-text-1 hover:bg-ice-hover"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── CategorySubMenu (two-level) ────────────────────────────────────────────

export const CategorySubMenu: React.FC<{
  label: string;
  isOpen: boolean;
  onEnter: () => void;
  onLeave: () => void;
  categories: Array<{ label: string; items: Array<{ label: string; onClick: () => void }> }>;
}> = ({ label, isOpen, onEnter, onLeave, categories }) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [openCat, setOpenCat] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ x: rect.right - 4, y: rect.top });
    }
    if (!isOpen) setOpenCat(null);
  }, [isOpen]);

  return (
    <div ref={triggerRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded text-ice-text-1 ${isOpen ? 'bg-ice-hover' : 'hover:bg-ice-hover'}`}
      >
        <span>{label}</span>
        <span className="text-ice-text-3 text-ice-xs ml-4">▸</span>
      </button>
      {isOpen && (
        <div
          className="fixed min-w-[160px] max-h-[80vh] overflow-y-auto bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1 z-[9999]"
          style={{ left: pos.x, top: pos.y }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {categories.map((cat) => (
            <SubMenu
              key={cat.label}
              label={cat.label}
              items={cat.items}
              isOpen={openCat === cat.label}
              onEnter={() => { clearTimeout(closeTimer.current); setOpenCat(cat.label); }}
              onLeave={() => { closeTimer.current = setTimeout(() => setOpenCat(null), 100); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
