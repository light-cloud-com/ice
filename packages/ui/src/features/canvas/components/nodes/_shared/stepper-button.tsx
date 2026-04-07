import React, { memo } from 'react';

interface StepperButtonProps {
  label: string;
  onClick: (e: React.MouseEvent) => void;
}

export const StepperButton: React.FC<StepperButtonProps> = memo(({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    style={{
      width: 18,
      height: 18,
      borderRadius: 3,
      border: '0.5px solid var(--ice-border-strong)',
      background: 'var(--ice-bg-raised)',
      color: 'var(--ice-text-tertiary)',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      lineHeight: 1,
    }}
  >
    {label}
  </button>
));

StepperButton.displayName = 'StepperButton';
