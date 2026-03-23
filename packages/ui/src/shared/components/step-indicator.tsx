/**
 * StepIndicator — Reusable multi-step progress component
 *
 * Horizontal step circles with connector lines:
 *   (1)---(2)---(3)---(4)
 *
 * States: done (green check), active (accent ring), pending (muted).
 * Used by onboarding, project wizard, and any multi-step flow.
 */

import { Check } from 'lucide-react';
import React from 'react';
import { cn } from '../utils/cn';

interface StepIndicatorProps {
  /** Current step (1-based) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Labels for each step */
  labels: string[];
  /** Optional className for the container */
  className?: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps, labels, className }) => {
  return (
    <div className={cn('flex items-center justify-center w-full px-4 py-3', className)}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isDone = step < currentStep;
        const isActive = step === currentStep;
        const isPending = step > currentStep;

        return (
          <React.Fragment key={step}>
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all',
                  isDone && 'bg-ice-green text-ice-text-1',
                  isActive && 'bg-ice-accent text-ice-text-1 ring-2 ring-ice-accent/40',
                  isPending && 'bg-ice-raised text-ice-text-2 border border-ice-border',
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : step}
              </div>
              <span
                className={cn(
                  'text-ice-xs font-medium whitespace-nowrap',
                  isDone && 'text-ice-green',
                  isActive && 'text-ice-accent',
                  isPending && 'text-ice-text-2',
                )}
              >
                {labels[i]}
              </span>
            </div>

            {/* Connector line */}
            {step < totalSteps && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2 mt-[-16px] rounded-full transition-all',
                  step < currentStep ? 'bg-ice-green' : 'bg-ice-border',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
