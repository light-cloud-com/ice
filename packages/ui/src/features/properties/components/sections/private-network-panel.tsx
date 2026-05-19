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
import { t } from '../../../../i18n';
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
            {direction === 'inbound'
              ? t('canvas.properties.privateNetwork.allowedSources')
              : t('canvas.properties.privateNetwork.allowedDestinations')}
          </div>
          {allowlist.length === 0 && (
            <div className="text-ice-2xs text-ice-text-3/50 italic py-1">
              {t('canvas.properties.privateNetwork.noEntries')}
            </div>
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
                aria-label={
                  direction === 'inbound'
                    ? t('canvas.properties.privateNetwork.removeSource')
                    : t('canvas.properties.privateNetwork.removeDestination')
                }
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
            {direction === 'inbound'
              ? t('canvas.properties.privateNetwork.addSource')
              : t('canvas.properties.privateNetwork.addDestination')}
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
        title={t('canvas.properties.privateNetwork.inboundTitle')}
        hint={t('canvas.properties.privateNetwork.inboundHint')}
        direction="inbound"
        policyField="ingress"
        allowlistField="ingressAllowlist"
        value={ingress}
        allowlist={ingressAllowlist}
        entryPlaceholder={t('canvas.properties.privateNetwork.inboundEntryPlaceholder')}
        options={[
          {
            value: 'all',
            label: t('canvas.properties.privateNetwork.inboundAllLabel'),
            hint: t('canvas.properties.privateNetwork.inboundAllHint'),
          },
          {
            value: 'allowlist',
            label: t('canvas.properties.privateNetwork.inboundAllowlistLabel'),
            hint: t('canvas.properties.privateNetwork.inboundAllowlistHint'),
          },
          {
            value: 'none',
            label: t('canvas.properties.privateNetwork.inboundNoneLabel'),
            hint: t('canvas.properties.privateNetwork.inboundNoneHint'),
          },
        ]}
        updateNodeField={updateNodeField}
      />

      <PrivateNetworkPolicySection
        title={t('canvas.properties.privateNetwork.outboundTitle')}
        hint={t('canvas.properties.privateNetwork.outboundHint')}
        direction="outbound"
        policyField="egress"
        allowlistField="egressAllowlist"
        value={egress}
        allowlist={egressAllowlist}
        entryPlaceholder={t('canvas.properties.privateNetwork.outboundEntryPlaceholder')}
        options={[
          {
            value: 'all',
            label: t('canvas.properties.privateNetwork.outboundAllLabel'),
            hint: t('canvas.properties.privateNetwork.outboundAllHint'),
          },
          {
            value: 'allowlist',
            label: t('canvas.properties.privateNetwork.outboundAllowlistLabel'),
            hint: t('canvas.properties.privateNetwork.outboundAllowlistHint'),
          },
          {
            value: 'none',
            label: t('canvas.properties.privateNetwork.outboundNoneLabel'),
            hint: t('canvas.properties.privateNetwork.outboundNoneHint'),
          },
        ]}
        updateNodeField={updateNodeField}
      />
    </div>
  );
};
