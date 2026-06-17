/**
 * Controls Help Modal
 *
 * Bottom-right "?" button that opens a popover showing all canvas controls.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';

export const ControlsHelpModal: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // AX3 — a real Escape handler (the header "ESC" affordance implied one but was
  // only a click button). Matches the canvas context menu's pattern.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const CONTROL_SECTIONS = [
    {
      title: t('canvas.controls.sectionNavigation'),
      items: [
        { keys: 'W A S D / Arrow Keys', action: t('canvas.controls.panCanvas') },
        { keys: 'Scroll Wheel', action: t('canvas.controls.zoomInOut') },
        { keys: 'Middle Mouse + Drag', action: t('canvas.controls.panCanvas') },
      ],
    },
    {
      title: t('canvas.controls.sectionSelection'),
      items: [
        { keys: 'Click', action: t('canvas.controls.selectNode') },
        { keys: 'Ctrl / Cmd + Click', action: t('canvas.controls.multiSelect') },
        { keys: 'Click + Drag (empty area)', action: t('canvas.controls.boxSelect') },
        { keys: 'Escape', action: t('canvas.controls.deselectAll') },
      ],
    },
    {
      title: t('canvas.controls.sectionEditing'),
      items: [
        // CD2 — the headline add affordance was undocumented here.
        { keys: 'Shift + A', action: t('canvas.controls.addBlock') },
        { keys: 'Delete / Backspace', action: t('canvas.controls.deleteSelected') },
        { keys: 'Cmd + C / X / V', action: t('canvas.controls.copyPaste') },
        { keys: 'Double-click label', action: t('canvas.controls.renameGroup') },
      ],
    },
    {
      title: t('canvas.controls.sectionContainment'),
      items: [
        { keys: 'Shift + Drag onto container', action: t('canvas.controls.moveIntoGroup') },
        { keys: 'Shift + Drag onto canvas', action: t('canvas.controls.detachFromContainer') },
      ],
    },
    {
      title: t('canvas.controls.sectionView'),
      items: [
        // The 1/2 view-level keys were removed with the view-level toggle
        // ("always Level 2"); altitude is zoom-driven now, so don't advertise
        // dead keys (IA3).
        { keys: 'Ctrl + Shift + D', action: t('canvas.controls.toggleDebug') },
      ],
    },
  ];

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
        title={t('canvas.controls.shortcutsTitle')}
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
            role="dialog"
            aria-modal="true"
            aria-label={t('canvas.controls.title')}
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
              <span className="text-xs font-semibold" style={{ color: 'var(--ice-text-primary)' }}>
                {t('canvas.controls.title')}
              </span>
              <button onClick={() => setOpen(false)} className="text-xs" style={{ color: 'var(--ice-text-tertiary)' }}>
                {t('canvas.controls.escButton')}
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
                        <span className="text-ice-sm font-mono shrink-0" style={{ color: 'var(--ice-text-tertiary)' }}>
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
