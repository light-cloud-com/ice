/**
 * Scaling Section — scaling-tab content for nodes whose `behavior` is
 * `'scalable'` (Cloud Run, GKE, Lambda, etc.). Renders an active-instances
 * badge (only when `data.activeInstances` is set), min/max-instance steppers,
 * a scale-on metric selector with five options, and a threshold input that
 * appears only when a non-`'custom'` metric is selected.
 *
 * Pure presentational: takes `selectedNode` + `updateNodeField` as props,
 * derives `minInstances` / `maxInstances` / `scalingMetric` /
 * `scalingThreshold` from `selectedNode.data` internally. The orchestrator
 * keeps the `activeTab === 'scaling' && isScalable` gate at the callsite.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 664-706 during
 * rf-props-14. Default values (`?? 1`, `?? 3`, `?? 99`, `?? 70`), the
 * `scalingMetric !== 'custom'` gate on the threshold input, and the empty
 * `Section title=""` are all preserved exactly.
 */

import React from 'react';
import { t } from '../../../../i18n';
import { Section, StepperField, SelectField, NumberField } from '../fields';
import type { CardNode } from '../../../../store/slices/cards-slice';

// ─── Scaling Section ────────────────────────────────────────────────────────

export const ScalingSection: React.FC<{
  selectedNode: CardNode;
  updateNodeField: (field: string, value: unknown) => void;
}> = ({ selectedNode, updateNodeField }) => {
  const minInstances = selectedNode.data?.minInstances != null ? Number(selectedNode.data.minInstances) : null;
  const maxInstances = selectedNode.data?.maxInstances != null ? Number(selectedNode.data.maxInstances) : null;
  const activeInstances = selectedNode.data?.activeInstances != null ? Number(selectedNode.data.activeInstances) : null;
  const scalingMetric = (selectedNode.data?.scalingMetric as string) || '';
  const scalingThreshold =
    selectedNode.data?.scalingThreshold != null ? Number(selectedNode.data.scalingThreshold) : 70;

  return (
    <Section title="">
      {activeInstances != null && (
        <div className="flex items-center justify-between gap-2 py-1">
          <span className="text-ice-sm text-ice-text-2 shrink-0">{t('properties.scaling.active')}</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-ice-base text-emerald-400 font-mono font-semibold">
              {activeInstances} {t('properties.scaling.running')}
            </span>
          </div>
        </div>
      )}
      <StepperField
        label={t('properties.scaling.minInstances')}
        value={minInstances ?? 1}
        min={0}
        max={maxInstances ?? 99}
        onChange={(v) => updateNodeField('minInstances', v)}
      />
      <StepperField
        label={t('properties.scaling.maxInstances')}
        value={maxInstances ?? 3}
        min={minInstances ?? 0}
        max={99}
        onChange={(v) => updateNodeField('maxInstances', v)}
      />
      <SelectField
        label={t('properties.scaling.scaleOn')}
        value={scalingMetric}
        options={['cpu', 'memory', 'requests', 'queue_depth', 'custom']}
        onChange={(v) => updateNodeField('scalingMetric', v)}
      />
      {scalingMetric && scalingMetric !== 'custom' && (
        <NumberField
          label={t('properties.scaling.threshold')}
          value={scalingThreshold}
          onChange={(v) => updateNodeField('scalingThreshold', v)}
        />
      )}
    </Section>
  );
};
