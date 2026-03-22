/**
 * Onboarding Step 1 — Welcome
 *
 * Simple greeting screen. No decisions — just says hello.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';

export const WelcomeStep: React.FC = () => {
  const userName = useSelector((s: RootState) => s.account.user?.name);

  return (
    <div className="space-y-6 text-center py-4">
      <div>
        <h2 className="text-2xl font-semibold text-ice-text-1">
          Welcome to ICE{userName ? `, ${userName.split(' ')[0]}` : ''}
        </h2>
        <p className="text-sm text-ice-text-2 mt-2">Design, deploy, and manage cloud infrastructure visually</p>
      </div>

      <div className="space-y-3 text-left max-w-sm mx-auto">
        <Feature title="Visual canvas" description="Drag-and-drop infrastructure blocks onto a live canvas" />
        <Feature title="Multi-cloud" description="GCP, AWS, and Azure — design once, deploy anywhere" />
        <Feature title="CI/CD built in" description="Connect GitHub and deploy on every push" />
      </div>

      <p className="text-xs text-ice-text-3">This setup takes about a minute. You can skip any step.</p>
    </div>
  );
};

const Feature: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-ice-surface border border-ice-border">
    <div className="w-1.5 h-1.5 rounded-full bg-ice-accent mt-1.5 shrink-0" />
    <div>
      <p className="text-sm font-medium text-ice-text-1">{title}</p>
      <p className="text-xs text-ice-text-2">{description}</p>
    </div>
  </div>
);
