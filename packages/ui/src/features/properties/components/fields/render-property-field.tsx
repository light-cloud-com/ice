/**
 * Canonical home for the resource-def type tree and the property-field
 * factory + orchestrator.
 *
 * Type tree (sourced verbatim from `core` HIGH_LEVEL_CATEGORIES, kept here
 * so other modules don't redeclare them):
 *   OptionDetail        — one entry of `optionDetails` for select-with-detail.
 *   CustomInputConfig   — config block for the 'custom' option's underlying input.
 *   HighLevelProperty   — one schema-driven property rendered into the panel.
 *   ProviderImpl        — provider-specific implementation reference for a resource.
 *   ResourceDef         — top-level resource (with its `properties`).
 *   ResourceCategory    — grouping wrapper for a list of `ResourceDef`s.
 *
 * Components:
 *   `renderPropertyField` — factory function. Reads `prop.type` and dispatches
 *     to the matching field primitive: `IceSelect` (select+optionDetails),
 *     `SelectField` (select+options), `ListField`, `QueueListField`,
 *     `NumberField`, `StepperField` (boolean — repurposed as on/off toggle),
 *     default `TextField`. The select+optionDetails branch additionally
 *     renders `CustomValueInput` underneath when the current value is
 *     `'custom'` and `prop.customInput` is configured.
 *
 *   `PropertyFields` — orchestrator. Provider-filters `optionDetails` by the
 *     node's cloud provider, hides `tier === 'advanced'` properties (essential
 *     + detailed only — advanced is intentionally hidden), iterates with
 *     `renderPropertyField`, and surfaces `propertyIssues` as inline error /
 *     amber messages. Wraps each field with `data-prop-key={prop.name}`
 *     (E2E selector — preserved verbatim).
 *
 * Extracted from `properties-panel.tsx` lines 66–124 (types) + 286–415
 * (`renderPropertyField`) + 417–468 (`PropertyFields`) in rf-props-9.
 */

import React from 'react';
import { t } from '../../../../i18n';
import { IceSelect } from '../../../../shared/components/ui/ice-select';
import { cn } from '../../../../shared/utils/cn';
import {
  Section,
  TextField,
  NumberField,
  SelectField,
  ListField,
  QueueListField,
  StepperField,
  PropertyLabel,
  CustomValueInput,
} from './index';

// ─── Types from core HIGH_LEVEL_CATEGORIES ──────────────────────────────────

export interface OptionDetail {
  value: string;
  label: string;
  description?: string;
  cost?: string;
  provider?: string;
  tooltip?: string;
}

export interface CustomInputConfig {
  type: 'number' | 'string';
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface HighLevelProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'list' | 'queue_list';
  required: boolean;
  description: string;
  options?: string[];
  default?: unknown;
  tier?: 'essential' | 'detailed' | 'advanced';
  placeholder?: string;
  addLabel?: string;
  optionDetails?: OptionDetail[];
  tooltip?: string;
  customInput?: CustomInputConfig;
  /** When set, only render if `nodeData[field]` matches `equals` (string
   *  equality, or array membership). Lets one property gate another —
   *  e.g. only show the cron-expression input when frequency === 'Custom'. */
  visibleWhen?: {
    field: string;
    equals: string | string[];
  };
}

export interface ProviderImpl {
  provider: string;
  resource_type: string;
  display_name: string;
}

export interface ResourceDef {
  ice_type: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  behavior: string;
  providers: string[];
  implementations: ProviderImpl[];
  properties: HighLevelProperty[];
}

export interface ResourceCategory {
  category: string;
  categoryId: string;
  resources: ResourceDef[];
}

// ─── Tiered property fields ────────────────────────────────────────────────

export function renderPropertyField(
  prop: HighLevelProperty,
  value: unknown,
  onChange: (field: string, value: unknown) => void,
  nodeData?: Record<string, unknown>,
): React.ReactNode {
  // Select with optionDetails — use IceSelect dropdown
  if (prop.type === 'select' && prop.optionDetails && prop.optionDetails.length > 0) {
    const strVal = value != null ? String(value) : prop.default != null ? String(prop.default) : '';
    const isCustomSelected = strVal === 'custom' && prop.customInput;
    const customVal = nodeData?.[`${prop.name}_custom`];
    return (
      <div key={prop.name} className="py-1">
        <div className="flex items-center justify-between gap-2">
          <PropertyLabel label={prop.label} tooltip={prop.tooltip} />
          <IceSelect
            value={strVal}
            width="160px"
            onChange={(v) => {
              onChange(prop.name, v);
              const detail = prop.optionDetails!.find((o) => o.value === v);
              if (detail) {
                const displayParts = [detail.label, detail.description].filter(Boolean);
                onChange(`${prop.name}_display`, displayParts.join(' · '));
              }
            }}
            options={prop.optionDetails.map((o) => ({
              value: o.value,
              label: o.label,
              description: o.cost ? `${o.description || ''} ${o.cost}`.trim() : o.description,
            }))}
          />
        </div>
        {isCustomSelected && (
          <CustomValueInput
            config={prop.customInput!}
            value={customVal}
            onChange={(v) => {
              onChange(`${prop.name}_custom`, v);
              onChange(`${prop.name}_display`, `Custom: ${v} ${prop.customInput!.unit}`);
            }}
          />
        )}
      </div>
    );
  }
  if (prop.type === 'list') {
    const listVal = Array.isArray(value) ? (value as string[]) : [];
    return (
      <ListField
        key={prop.name}
        label={prop.label}
        value={listVal}
        onChange={(v) => onChange(prop.name, v)}
        placeholder={prop.placeholder}
        addLabel={prop.addLabel}
      />
    );
  }
  if (prop.type === 'queue_list') {
    const listVal = Array.isArray(value) ? (value as string[]) : [];
    return (
      <QueueListField
        key={prop.name}
        label={prop.label}
        value={listVal}
        onChange={(v) => onChange(prop.name, v)}
        placeholder={prop.placeholder}
        addLabel={prop.addLabel}
      />
    );
  }
  if (prop.type === 'select' && prop.options) {
    return (
      <SelectField
        key={prop.name}
        label={prop.label}
        value={value != null ? String(value) : ''}
        options={prop.options}
        onChange={(v) => onChange(prop.name, v)}
      />
    );
  }
  if (prop.type === 'boolean') {
    return (
      <div key={prop.name} className="flex items-center justify-between gap-2 py-1">
        <PropertyLabel label={prop.label} tooltip={prop.tooltip} />
        <button
          onClick={() => onChange(prop.name, value != null ? !value : !prop.default)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            (value != null ? !!value : !!prop.default) ? 'bg-ice-accent' : 'bg-ice-border/50',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
              (value != null ? !!value : !!prop.default) ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    );
  }
  if (prop.type === 'number') {
    return (
      <div key={prop.name} className="flex items-center justify-between gap-2 py-1">
        <PropertyLabel label={prop.label} tooltip={prop.tooltip} />
        <input
          type="number"
          value={value != null ? Number(value) : prop.default != null ? Number(prop.default) : ''}
          onChange={(e) => onChange(prop.name, e.target.value ? Number(e.target.value) : '')}
          className="w-20 h-6 px-1.5 rounded text-ice-xs text-ice-text-1 bg-transparent border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent outline-none transition-colors text-right"
        />
      </div>
    );
  }
  return (
    <div key={prop.name} className="flex items-center justify-between gap-2 py-1">
      <PropertyLabel label={prop.label} tooltip={prop.tooltip} />
      <input
        type="text"
        value={value != null ? String(value) : ''}
        placeholder={prop.placeholder}
        onChange={(e) => onChange(prop.name, e.target.value)}
        className="flex-1 max-w-[160px] h-6 px-1.5 rounded text-ice-xs text-ice-text-1 bg-transparent border-b border-ice-border/50 hover:border-ice-text-3/50 focus:border-ice-accent outline-none transition-colors placeholder:text-ice-text-3/30"
      />
    </div>
  );
}

export const PropertyFields: React.FC<{
  properties: HighLevelProperty[];
  nodeData: Record<string, unknown>;
  onFieldChange: (field: string, value: unknown) => void;
  /** Validation issues mapped by propertyPath */
  propertyIssues?: Map<string, { severity: string; message: string }>;
}> = ({ properties, nodeData, onFieldChange, propertyIssues }) => {
  const provider = ((nodeData.provider as string) || '').toLowerCase();

  // Filter optionDetails by the node's cloud provider
  const filterByProvider = (prop: HighLevelProperty): HighLevelProperty => {
    if (!prop.optionDetails || !provider) return prop;
    const filtered = prop.optionDetails.filter((o) => !o.provider || o.provider === provider);
    return filtered.length > 0 ? { ...prop, optionDetails: filtered } : prop;
  };

  // Show all properties (essential + detailed); advanced tier is intentionally hidden.
  // Then apply visibleWhen gates so conditional fields stay hidden until their
  // gating field has the right value (e.g. cron-expression input only when
  // frequency === 'Custom').
  const matchesVisibleWhen = (p: HighLevelProperty): boolean => {
    if (!p.visibleWhen) return true;
    const current = nodeData[p.visibleWhen.field];
    const target = p.visibleWhen.equals;
    if (Array.isArray(target)) return target.some((v) => v === current);
    return current === target;
  };
  const visible = properties
    .filter((p) => !p.tier || p.tier === 'essential' || p.tier === 'detailed')
    .filter(matchesVisibleWhen);

  return (
    <>
      {visible.length > 0 && (
        <Section title={t('properties.config.title')}>
          {visible.map((prop) => (
            <div key={prop.name} data-prop-key={prop.name}>
              {renderPropertyField(filterByProvider(prop), nodeData[prop.name], onFieldChange, nodeData)}
              {propertyIssues?.has(prop.name) && (
                <div
                  className={`px-3 pb-1 text-ice-2xs ${
                    propertyIssues.get(prop.name)!.severity === 'error' ? 'text-red-400' : 'text-amber-400'
                  }`}
                >
                  {propertyIssues.get(prop.name)!.message}
                </div>
              )}
            </div>
          ))}
        </Section>
      )}
    </>
  );
};
