/**
 * Group Color Picker — color-swatch grid + opacity slider for the appearance
 * properties of a `container`/group node. Pure presentational; the parent
 * (`properties-panel.tsx`) owns the `groupColor`/`groupOpacity` fields on the
 * selected node's data and wires the `onChange` / `onOpacityChange` callbacks
 * to `updateNodeField`. Reset returns the opacity to 0.1, the same default the
 * orchestrator uses for newly-created group nodes.
 *
 * Extracted verbatim from `properties-panel.tsx` during rf-props-11. Tailwind
 * classes, swatch-border conditional styling, the `Math.round(opacity * 100)`
 * formatting, and the slider's min/max/step are preserved exactly.
 */

import React from 'react';
import { GROUP_COLOR_PRESETS } from '../../../../config/color-palette';
import { t } from '../../../../i18n';

// ─── Group Color Picker ─────────────────────────────────────────────────────

const GROUP_COLORS = GROUP_COLOR_PRESETS;

export const GroupColorPicker: React.FC<{
  color: string;
  opacity: number;
  onChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
}> = ({ color, opacity, onChange, onOpacityChange }) => (
  <div className="px-3 py-2 border-b border-ice-border space-y-2.5">
    <div>
      <div className="text-ice-2xs text-ice-text-3 mb-1.5">{t('properties.groupColor')}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {GROUP_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: c === color ? 'white' : 'transparent',
              boxShadow: c === color ? `0 0 0 2px ${c}` : undefined,
            }}
            title={c}
          />
        ))}
      </div>
    </div>
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-ice-2xs text-ice-text-3">{t('properties.groupOpacity')}</span>
        <span className="text-ice-2xs text-ice-text-3 font-mono tabular-nums">{Math.round(opacity * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(opacity * 100)}
        onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
        className="w-full h-1 appearance-none rounded-full bg-ice-border accent-current cursor-pointer"
        style={{ accentColor: color }}
      />
      <button
        onClick={() => onOpacityChange(0.1)}
        className="mt-1.5 px-2 py-0.5 text-ice-2xs font-medium rounded bg-ice-hover text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-active transition-colors"
      >
        {t('common.buttons.reset')}
      </button>
    </div>
  </div>
);
