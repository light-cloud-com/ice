import type { InfoContent } from '../_shared/types';

export const privateNetworkInfo: InfoContent = {
  overview: {
    markdown: `
# Private Network

A walled VPC bubble. Drop compute blocks inside to put them on a private
network — they communicate with each other using private IPs, and the
public internet cannot reach them directly.

## Ingress / Egress policies

- **Inbound** (ingress): \`all\` (open), \`allowlist\` (only listed ranges), \`none\` (sealed).
- **Outbound** (egress): \`all\`, \`allowlist\`, \`none\` (air-gapped).

Set these in the properties panel. A Sealed network can still have outbound
access, and an Open one can still be egress-restricted — they're independent.

## Public entry point

If you need to expose a nested service publicly, drop a **Custom Domain**
inside the Private Network. It becomes the ONLY public gateway for the
sealed services; everything else stays private.

## What it compiles to

A VPC + subnet on each provider, plus firewall rules derived from your
ingress/egress policies. Nested services get deployed into the subnet
automatically.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'VPC', type: 'aws_vpc' },
      { name: 'Subnet', type: 'aws_subnet' },
      { name: 'Route Table', type: 'aws_route_table' },
      { name: 'Security Group', type: 'aws_security_group' },
      { name: 'NAT Gateway', type: 'aws_nat_gateway', optional: true },
    ],
    gcp: [
      { name: 'VPC Network', type: 'google_compute_network' },
      { name: 'Subnetwork', type: 'google_compute_subnetwork' },
      { name: 'Ingress Firewall', type: 'google_compute_firewall', optional: true },
      { name: 'Egress Firewall', type: 'google_compute_firewall', optional: true },
    ],
    azure: [
      { name: 'Virtual Network', type: 'azurerm_virtual_network' },
      { name: 'Subnet', type: 'azurerm_subnet' },
      { name: 'Network Security Group', type: 'azurerm_network_security_group', optional: true },
    ],
  },
  relatedConcepts: ['Network.CustomDomain', 'Compute.Container', 'Database.PostgreSQL'],
};
