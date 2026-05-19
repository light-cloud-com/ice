import type { InfoContent } from '../_shared/types';

export const customDomainInfo: InfoContent = {
  overview: {
    markdown: `
# Custom Domain

Your own hostname with HTTPS, wired to one or more services. Handles DNS,
SSL certificate provisioning, and subdomain routing in one block.

## What it does

- DNS record management for your domain
- Automatic SSL/TLS certificate (managed, auto-renewing)
- Host-based routing: \`api.example.com\` → Backend, \`example.com\` → Static Site

## Connecting

Drag one or more connections from Custom Domain to **Static Site**, **SSR Site**,
**Scalable Backend**, or **API Gateway**. Each edge carries an optional subdomain —
multiple subdomains on one domain route via a shared load balancer.

## Inside a Private Network

If placed **inside a Private Network**, this becomes the only public entry
point to the sealed network. Outside traffic hits Custom Domain, which routes
to nested services. The rest of the network stays private.
    `.trim(),
    markdownZh: `
# 自定义域名

使用自己的主机名 + HTTPS，连接到一个或多个服务。一个块即可处理 DNS、SSL 证书签发以及子域名路由。

## 功能

- 为域名管理 DNS 记录
- 自动 SSL/TLS 证书（托管、自动续期）
- 基于主机名的路由：\`api.example.com\` → 后端，\`example.com\` → 静态站点

## 连接方式

从自定义域名拖一条或多条连接到 **静态站点**、**SSR 站点**、**可扩展后端** 或 **API Gateway**。每条边可以携带一个可选子域名 —— 同一域名下的多个子域名通过共享负载均衡器路由。

## 在私有网络中

若放置在 **私有网络** 内部，它将成为该封闭网络唯一的公网入口。外部流量先打到自定义域名，再由其路由到内嵌的服务。网络其余部分保持私有。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'ACM Certificate', type: 'aws_acm_certificate' },
      { name: 'Route 53 Record', type: 'aws_route53_record' },
      { name: 'ALB Listener', type: 'aws_lb_listener' },
    ],
    gcp: [
      { name: 'Managed SSL Certificate', type: 'google_compute_managed_ssl_certificate' },
      { name: 'URL Map', type: 'google_compute_url_map' },
      { name: 'Target HTTPS Proxy', type: 'google_compute_target_https_proxy' },
      { name: 'Global Forwarding Rule', type: 'google_compute_global_forwarding_rule' },
    ],
    azure: [
      { name: 'DNS Zone', type: 'azurerm_dns_zone' },
      { name: 'Front Door / App Gateway', type: 'azurerm_cdn_frontdoor_profile' },
    ],
  },
  relatedConcepts: ['Compute.StaticSite', 'Compute.SSRSite', 'Compute.Container', 'Network.PrivateNetwork'],
};
