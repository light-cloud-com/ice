/**
 * Private Network Panel — ingress + egress policy editor for
 * `Network.PrivateNetwork` blocks.
 *
 * Controls the inbound and outbound internet policies for services nested
 * inside a PrivateNetwork. The two policies are independent — a Sealed
 * (ingress = 'none') network can still have outbound, and an Open
 * (ingress = 'all') one can still be egress-restricted.
 *
 * The inner `PrivateNetworkPolicySection` is a per-direction
 * sub-component (radio group + optional allowlist field). It stays
 * file-private because it has no callers outside this file.
 *
 * **Behavior-risk discipline (rf-props-16):** both sub-sections preserve
 * `data-testid="pn-${direction}-..."` attributes verbatim — they are
 * referenced by E2E selectors:
 *   - `pn-${direction}-${opt.value}` on each policy radio label
 *   - `pn-${direction}-allowlist-entry-${i}` on each allowlist text input
 *   - `pn-${direction}-allowlist-add` on the "+ Add ..." button
 * `direction` is `'inbound' | 'outbound'`, distinct from the data fields
 * `ingress` / `egress` on `selectedNode.data`.
 *
 * Default policy is `'all'` for both directions when the underlying
 * `selectedNode.data.ingress` / `selectedNode.data.egress` is unset.
 *
 * Labels bridge technical and mental models: "Allow all (Open)", etc.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 903-1070 during
 * rf-props-16. The `PrivateNetworkPolicy` type alias and
 * `PolicySectionProps` interface stay file-private.
 */

import React from 'react';
import { Section } from '../fields';

type PrivateNetworkPolicy = 'all' | 'allowlist' | 'none';

interface PolicySectionProps {
  title: string;
  hint: string;
  direction: 'inbound' | 'outbound';
  policyField: string;
  allowlistField: string;
  value: PrivateNetworkPolicy;
  allowlist: string[];
  entryPlaceholder: string;
  options: Array<{ value: PrivateNetworkPolicy; label: string; hint: string }>;
  updateNodeField: (field: string, value: unknown) => void;
}

const PrivateNetworkPolicySection: React.FC<PolicySectionProps> = ({
  title,
  hint,
  direction,
  policyField,
  allowlistField,
  value,
  allowlist,
  entryPlaceholder,
  options,
  updateNodeField,
}) => {
  const setPolicy = (next: PrivateNetworkPolicy) => updateNodeField(policyField, next);

  const updateEntry = (index: number, entry: string) => {
    const next = allowlist.slice();
    next[index] = entry;
    updateNodeField(allowlistField, next);
  };

  const addEntry = () => updateNodeField(allowlistField, [...allowlist, '']);

  const removeEntry = (index: number) =>
    updateNodeField(
      allowlistField,
      allowlist.filter((_, i) => i !== index),
    );

  return (
    <Section title={title}>
      <p className="px-2 pb-1 text-ice-2xs text-ice-text-3 leading-relaxed">{hint}</p>
      <div className="space-y-0.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            data-testid={`pn-${direction}-${opt.value}`}
            className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-ice-hover cursor-pointer"
          >
            <input
              type="radio"
              name={`private-network-${direction}`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => setPolicy(opt.value)}
              className="mt-0.5 accent-red-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-ice-xs text-ice-text-1">{opt.label}</div>
              <div className="text-ice-2xs text-ice-text-3 leading-snug">{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>

      {value === 'allowlist' && (
        <div className="mt-2 px-2 space-y-1">
          <div className="text-ice-2xs text-ice-text-3">
            {direction === 'inbound' ? 'Allowed sources' : 'Allowed destinations'}
          </div>
          {allowlist.length === 0 && (
            <div className="text-ice-2xs text-ice-text-3/50 italic py-1">No entries yet. Click + below to add one.</div>
          )}
          {allowlist.map((entry, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                value={entry}
                onChange={(e) => updateEntry(i, e.target.value)}
                placeholder={entryPlaceholder}
                data-testid={`pn-${direction}-allowlist-entry-${i}`}
                className="flex-1 min-w-0 bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs font-mono text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
              />
              <button
                onClick={() => removeEntry(i)}
                className="p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-xs"
                aria-label={direction === 'inbound' ? 'Remove source' : 'Remove destination'}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={addEntry}
            data-testid={`pn-${direction}-allowlist-add`}
            className="mt-1 text-ice-2xs text-ice-text-3/60 hover:text-ice-accent transition-colors"
          >
            + Add {direction === 'inbound' ? 'source' : 'destination'}
          </button>
        </div>
      )}
    </Section>
  );
};

export const PrivateNetworkPanel: React.FC<{
  selectedNode: any;
  updateNodeField: (field: string, value: unknown) => void;
}> = ({ selectedNode, updateNodeField }) => {
  const ingress = ((selectedNode?.data?.ingress as PrivateNetworkPolicy) || 'all') as PrivateNetworkPolicy;
  const ingressAllowlist = ((selectedNode?.data?.ingressAllowlist as string[] | undefined) || []).slice();
  const egress = ((selectedNode?.data?.egress as PrivateNetworkPolicy) || 'all') as PrivateNetworkPolicy;
  const egressAllowlist = ((selectedNode?.data?.egressAllowlist as string[] | undefined) || []).slice();

  return (
    <div className="space-y-3">
      <PrivateNetworkPolicySection
        title="Inbound internet"
        hint="Controls who on the public internet can reach services inside this network. Independent from the outbound policy below."
        direction="inbound"
        policyField="ingress"
        allowlistField="ingressAllowlist"
        value={ingress}
        allowlist={ingressAllowlist}
        entryPlaceholder="203.0.113.0/24 or 1.2.3.4"
        options={[
          { value: 'all', label: 'Allow all inbound (Open)', hint: 'Public reachable. Default.' },
          {
            value: 'allowlist',
            label: 'Allowlist specific sources (Restricted)',
            hint: 'Only listed source ranges or IPs can reach in.',
          },
          {
            value: 'none',
            label: 'Block all inbound (Sealed)',
            hint: 'Internal only. Services inside talk east-west.',
          },
        ]}
        updateNodeField={updateNodeField}
      />

      <PrivateNetworkPolicySection
        title="Outbound internet"
        hint="Controls whether services inside this network can reach the public internet. Independent from the inbound policy above."
        direction="outbound"
        policyField="egress"
        allowlistField="egressAllowlist"
        value={egress}
        allowlist={egressAllowlist}
        entryPlaceholder="api.stripe.com or 10.0.0.0/8"
        options={[
          { value: 'all', label: 'Allow all outbound', hint: 'Services can call any public URL. Default.' },
          {
            value: 'allowlist',
            label: 'Allowlist specific destinations',
            hint: 'Only listed hostnames or IP ranges are reachable.',
          },
          { value: 'none', label: 'Block all outbound', hint: 'Air-gapped. No public internet access.' },
        ]}
        updateNodeField={updateNodeField}
      />
    </div>
  );
};
