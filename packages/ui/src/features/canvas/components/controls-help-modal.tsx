/**
 * Controls Help Modal
 *
 * Bottom-right "?" button that opens a popover showing all canvas controls.
 */

import React, { useState } from 'react';

const CONTROL_SECTIONS = [
  {
    title: 'Navigation',
    items: [
      { keys: 'W A S D / Arrow Keys', action: 'Pan canvas' },
      { keys: 'Scroll Wheel', action: 'Zoom in / out' },
      { keys: 'Middle Mouse + Drag', action: 'Pan canvas' },
    ],
  },
  {
    title: 'Selection',
    items: [
      { keys: 'Click', action: 'Select node' },
      { keys: 'Ctrl / Cmd + Click', action: 'Multi-select' },
      { keys: 'Click + Drag (empty area)', action: 'Box select' },
      { keys: 'Escape', action: 'Deselect all' },
    ],
  },
  {
    title: 'Editing',
    items: [
      { keys: 'Delete / Backspace', action: 'Delete selected' },
      { keys: 'Cmd + C / X / V', action: 'Copy / Cut / Paste' },
      { keys: 'Double-click label', action: 'Rename group' },
    ],
  },
  {
    title: 'Containment',
    items: [
      { keys: 'Shift + Drag onto container', action: 'Move into group / block' },
      { keys: 'Shift + Drag onto canvas', action: 'Detach from container' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: '1', action: 'Architecture view' },
      { keys: '2', action: 'Infrastructure view' },
      { keys: 'Ctrl + Shift + D', action: 'Toggle debug panel' },
    ],
  },
];

export const ControlsHelpModal: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button — bottom-right corner */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute bottom-3 right-3 z-20 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
        style={{
          background: open ? 'var(--ice-border-strong)' : 'var(--ice-bg-raised)',
          color: open ? 'var(--ice-text-primary)' : 'var(--ice-text-secondary)',
          border: '1px solid var(--ice-border-strong)',
        }}
        title="Keyboard shortcuts"
      >
        ?
      </button>

      {/* Modal popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="absolute inset-0 z-20" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div
            className="absolute bottom-12 right-3 z-30 rounded-lg overflow-hidden"
            style={{
              background: 'var(--ice-bg-base)',
              border: '1px solid var(--ice-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              width: 320,
              maxHeight: 420,
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div
              className="px-4 py-2.5 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--ice-border)' }}
            >
              <span className="text-xs font-semibold text-slate-300">Controls</span>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-xs"
              >
                ESC
              </button>
            </div>

            {/* Sections */}
            <div className="p-3 flex flex-col gap-3">
              {CONTROL_SECTIONS.map((section) => (
                <div key={section.title}>
                  <div
                    className="text-ice-xs font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--ice-border-strong)' }}
                  >
                    {section.title}
                  </div>
                  <div className="flex flex-col gap-1">
                    {section.items.map((item) => (
                      <div key={item.keys} className="flex items-center justify-between gap-3">
                        <span
                          className="text-ice-sm font-mono shrink-0"
                          style={{ color: 'var(--ice-text-tertiary)' }}
                        >
                          {item.keys}
                        </span>
                        <span className="text-ice-sm text-right" style={{ color: 'var(--ice-text-secondary)' }}>
                          {item.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
};
