/**
 * Public Endpoint Domain Section — domain-tab content for nodes whose
 * `iceType` is `'Network.PublicEndpoint'`. Four fields: hostname, subdomain,
 * SSL mode (auto / manual / none), and DNS provider — all read from
 * `selectedNode.data` and write back through `updateNodeField`.
 *
 * Pure presentational: takes `selectedNode` + `updateNodeField` as props.
 * The orchestrator keeps the
 * `activeTab === 'domain' && iceType === 'Network.PublicEndpoint'` gate at
 * the callsite.
 *
 * Extracted verbatim from `properties-panel.tsx` lines 708-738 during
 * rf-props-14. Default values (`|| ''`, `|| 'auto'`), the SSL options array,
 * the placeholder t-keys, the empty `Section title=""`, and the `space-y-2`
 * wrapper div are all preserved exactly.
 */

import React from 'react';
import { t } from '../../../../i18n';
import type { CardNode } from '../../../../store/slices/cards-slice';
import { Section, TextField, SelectField } from '../fields';

// ─── Public Endpoint Domain Section ─────────────────────────────────────────

export const PublicEndpointDomainSection: React.FC<{
  selectedNode: CardNode;
  updateNodeField: (field: string, value: unknown) => void;
}> = ({ selectedNode, updateNodeField }) => (
  <Section title="">
    <div className="space-y-2">
      <TextField
        label={t('properties.domain.hostname')}
        value={(selectedNode?.data?.hostname as string) || ''}
        placeholder={t('properties.domain.hostnamePlaceholder')}
        onChange={(v) => updateNodeField('hostname', v)}
      />
      <TextField
        label={t('properties.domain.subdomain')}
        value={(selectedNode?.data?.subdomain as string) || ''}
        placeholder={t('properties.domain.subdomainPlaceholder')}
        onChange={(v) => updateNodeField('subdomain', v)}
      />
      <SelectField
        label={t('properties.domain.sslMode')}
        value={(selectedNode?.data?.sslMode as string) || 'auto'}
        options={['auto', 'manual', 'none']}
        onChange={(v) => updateNodeField('sslMode', v)}
      />
      <TextField
        label={t('properties.domain.dnsProvider')}
        value={(selectedNode?.data?.dnsProvider as string) || ''}
        placeholder={t('properties.domain.dnsProviderPlaceholder')}
        onChange={(v) => updateNodeField('dnsProvider', v)}
      />
    </div>
  </Section>
);
