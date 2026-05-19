/**
 * rf-ppanel-4 — BuildRow.
 *
 * Label/value row used inside the Build section to display detected
 * install/build/output commands. `null` value renders the em-dash
 * placeholder ('—').
 */

import React from 'react';

export interface BuildRowProps {
  label: string;
  value: string | null;
}

export const BuildRow: React.FC<BuildRowProps> = ({ label, value }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-ice-text-3">{label}</span>
    <span className="font-mono text-ice-text-2">{value || '—'}</span>
  </div>
);
