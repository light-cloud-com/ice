import React, { memo } from 'react';
import { t } from '../../../../../i18n';
import { FONT_MONO } from '../_shared/fonts';
import { StepperButton } from '../_shared/stepper-button';

interface ScalingRowProps {
  nodeId: string;
  minInstances: number | null;
  maxInstances: number | null;
  activeInstances: number | null;
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

export const ScalingRow: React.FC<ScalingRowProps> = memo(
  ({ nodeId, minInstances, maxInstances, activeInstances, onUpdateData }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
      {activeInstances != null && (
        <>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 600, fontFamily: FONT_MONO }}>
            {activeInstances}
          </span>
        </>
      )}
      <span style={{ color: 'var(--ice-text-secondary)', fontSize: 9, fontFamily: FONT_MONO, opacity: 0.7 }}>
        {activeInstances != null ? t('canvas.nodes.active') : t('canvas.nodes.instances')}
      </span>

      {/* Min stepper */}
      <StepperButton label="−" onClick={(e) => { e.stopPropagation(); onUpdateData?.(nodeId, { minInstances: Math.max(0, (minInstances ?? 1) - 1) }); }} />
      <span style={{ color: 'var(--ice-text-primary)', fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO, minWidth: 14, textAlign: 'center' }}>
        {minInstances ?? 1}
      </span>
      <StepperButton label="+" onClick={(e) => { e.stopPropagation(); onUpdateData?.(nodeId, { minInstances: Math.min((minInstances ?? 1) + 1, maxInstances ?? 99) }); }} />

      <span style={{ color: 'var(--ice-border-strong)', fontSize: 10, margin: '0 2px' }}>–</span>

      {/* Max stepper */}
      <StepperButton label="−" onClick={(e) => { e.stopPropagation(); onUpdateData?.(nodeId, { maxInstances: Math.max(minInstances ?? 1, (maxInstances ?? 3) - 1) }); }} />
      <span style={{ color: 'var(--ice-text-primary)', fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO, minWidth: 14, textAlign: 'center' }}>
        {maxInstances ?? 3}
      </span>
      <StepperButton label="+" onClick={(e) => { e.stopPropagation(); onUpdateData?.(nodeId, { maxInstances: (maxInstances ?? 3) + 1 }); }} />
    </div>
  ),
);

ScalingRow.displayName = 'ScalingRow';
