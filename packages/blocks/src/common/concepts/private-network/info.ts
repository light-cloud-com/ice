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
    markdownZh: `
# 私有网络

一个带围墙的 VPC 气泡。把计算类块拖进去，即可将它们放入一个私有网络 —— 内部通过私有 IP 通信，公共互联网无法直接到达。

## 入站 / 出站策略

- **入站**（ingress）：\`all\`（开放）、\`allowlist\`（仅放行所列网段）、\`none\`（封闭）。
- **出站**（egress）：\`all\`、\`allowlist\`、\`none\`（完全隔离）。

在属性面板中设置。封闭网络仍可以拥有出站访问，开放网络也可以限制出站 —— 两者相互独立。

## 公网入口

如果需要将内嵌的服务对外暴露，请在私有网络内放置一个 **自定义域名**。它将成为该封闭网络中唯一的公共入口；其余部分保持私有。

## 编译结果

在每个云厂商上对应一个 VPC + 子网，外加根据入/出站策略推导出的防火墙规则。内嵌服务会被自动部署到该子网。
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
