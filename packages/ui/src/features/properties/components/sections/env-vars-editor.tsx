/**
 * Env Vars Editor — editable list of environment variables, each row a
 * `{ name, value, isSecret? }` triple. The user can add a new blank row, edit
 * the name/value via two text inputs, toggle the row's secret-mode (which
 * masks the value with `'••••••'` and switches the value input to
 * `type="password"`), and remove the row entirely.
 *
 * Pure presentational: takes `variables` + `onChange(next)` as props. The
 * parent owns the canonical list (typically `selectedNode.data.variables`)
 * and reflects the new array back through `updateNodeField('variables', ...)`.
 *
 * Extracted verbatim from `properties-panel.tsx` during rf-props-13. Wraps
 * the `Section` field-primitive (rf-props-6). The 🔒 / 🔓 toggle emoji, the
 * `'••••••'` mask string, the Tailwind class strings, the `key={i}` row
 * keying, and the `type` flip on secret-mode are all preserved exactly.
 */

import React from 'react';
import { Section } from '../fields';
import { t } from '../../../../i18n';

// ─── Env Vars Editor ────────────────────────────────────────────────────────

export const EnvVarsEditor: React.FC<{
  variables: Array<{ name: string; value: string; isSecret?: boolean }>;
  onChange: (vars: Array<{ name: string; value: string; isSecret?: boolean }>) => void;
}> = ({ variables, onChange }) => {
  const handleAdd = () => {
    onChange([...variables, { name: '', value: '', isSecret: false }]);
  };

  const handleRemove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: 'name' | 'value' | 'isSecret', val: unknown) => {
    const updated = variables.map((v, i) => (i === index ? { ...v, [field]: val } : v));
    onChange(updated);
  };

  return (
    <Section title={t('properties.envVars.title')}>
      <div className="space-y-1.5">
        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={v.name}
              onChange={(e) => handleUpdate(i, 'name', e.target.value)}
              placeholder={t('properties.envVars.keyPlaceholder')}
              className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs font-mono rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-ice-text-3 text-ice-xs">=</span>
            <input
              value={v.isSecret ? '••••••' : v.value}
              onChange={(e) => handleUpdate(i, 'value', e.target.value)}
              placeholder={t('properties.envVars.valuePlaceholder')}
              type={v.isSecret ? 'password' : 'text'}
              className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs font-mono rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleUpdate(i, 'isSecret', !v.isSecret)}
              className={`p-0.5 rounded text-ice-xs transition-colors ${v.isSecret ? 'text-amber-500' : 'text-ice-text-3 hover:text-ice-text-2'}`}
              title={v.isSecret ? t('properties.envVars.secretTitle') : t('properties.envVars.makeSecretTitle')}
            >
              {v.isSecret ? '🔒' : '🔓'}
            </button>
            <button
              onClick={() => handleRemove(i)}
              className="p-0.5 text-ice-text-3 hover:text-red-400 transition-colors"
            >
              &times;
            </button>
          </div>
        ))}
        <button onClick={handleAdd} className="text-ice-xs text-ice-text-3 hover:text-blue-400 transition-colors">
          {t('properties.envVars.addVariable')}
        </button>
      </div>
    </Section>
  );
};
