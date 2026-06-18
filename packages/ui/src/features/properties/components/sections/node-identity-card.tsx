/**
 * Node Identity Card — top-of-panel identity strip.
 *
 * Extracted from `node-properties-section.tsx` during rf-npsec-2.
 * Renders the icon, an editable name input that commits on blur or Enter,
 * and a row of pill chips: resourceDef.display_name (or iceType when no
 * resourceDef), and the provider chip.
 *
 * Behavior preserved verbatim. The input uses `defaultValue` + `key={id}`
 * to swap state across nodes; that's load-bearing — selecting a different
 * node remounts the input fresh, instead of carrying the previous value.
 */

import type { Provider } from '@ice/blocks';
import React from 'react';
import { ConceptInfoTrigger } from '../../../concept-info';
import type { CardNode } from '../../../../store/slices/cards-slice';
import type { ResourceDef } from '../../hooks/use-resource-map';

export interface NodeIdentityCardProps {
  selectedNode: CardNode;
  iconUrl: string;
  label: string;
  iceType: string;
  provider: string;
  resourceDef: ResourceDef | undefined;
  onUpdateName: (name: string) => void;
}

export const NodeIdentityCard: React.FC<NodeIdentityCardProps> = ({
  selectedNode,
  iconUrl,
  label,
  iceType,
  provider,
  resourceDef,
  onUpdateName,
}) => {
  return (
    <div className="px-3 py-3 border-b border-ice-border">
      <div className="flex items-center gap-2 mb-1.5">
        <img src={iconUrl} alt="" className="w-5 h-5" />
        <input
          id="ice-properties-node-name"
          type="text"
          defaultValue={label}
          key={selectedNode?.id}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== label) onUpdateName(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 bg-transparent border-none text-ice-md text-ice-text-1 font-semibold outline-none focus:bg-ice-raised rounded px-1 -ml-1 transition-colors"
        />
      </div>
      <div className="flex items-center gap-1.5">
        {resourceDef && (
          <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">
            {resourceDef.display_name}
          </span>
        )}
        {iceType && !resourceDef && (
          <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">{iceType}</span>
        )}
        {provider && (
          <span className="text-ice-2xs bg-blue-950/50 text-blue-400 px-1.5 py-0.5 rounded font-mono uppercase">
            {provider}
          </span>
        )}
        {/* PE4 — the concept "i" explainer (Overview / Compiles-To / docs) was
            reachable only from the tiny canvas node. The panel is exactly where
            a user pauses to understand a block, so mount it here too. It
            self-gates via `hasConceptInfo(iceType)`, so it no-ops for blocks
            without registered content. */}
        <span className="ml-auto">
          <ConceptInfoTrigger
            iceType={iceType}
            displayName={resourceDef?.display_name || label || iceType}
            currentProvider={provider ? (provider as Provider) : undefined}
          />
        </span>
      </div>
    </div>
  );
};
