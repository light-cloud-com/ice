import type { InfoContent } from '../_shared/types';

export const publicTrafficInfo: InfoContent = {
  overview: {
    markdown: `
# Public Traffic

A **canvas-only** symbolic source node representing the internet and the
users arriving from it. Think of it as the "cloud labeled Users" icon
from architecture diagrams — it makes the public ingress path explicit.

## What it does

Draw an edge FROM Public Traffic TO any public-facing block (**Static Site**,
**SSR Site**, **Scalable Backend**, **API Gateway**, **Custom Domain**) to
document "users arrive from the internet and hit this service first."

## What it doesn't do

This block is purely documentation. It does not provision a load balancer,
DNS, or WAF. It does not log requests. It does not compile to any cloud
resource. It exists to keep your diagram legible.

If you want HTTPS + a real public entry point, use **Custom Domain**. If you
want centralized request management, use **API Gateway**. Public Traffic is
the *concept* of "the outside world," not a gateway.
    `.trim(),
    markdownZh: `
# 公网流量

一个 **仅画布展示** 的符号化来源节点，代表互联网以及从互联网到来的用户。可以把它理解为架构图中那个"标着 Users 的云朵"图标 —— 用来让公网入口路径一目了然。

## 功能

从 **公网流量** 拖一条边指向任何对外的块（**静态站点**、**SSR 站点**、**可扩展后端**、**API Gateway**、**自定义域名**），用来表达"用户从互联网到达，首先打到这个服务"。

## 不具备的功能

该块纯粹用于文档说明。它不会创建任何负载均衡器、DNS 或 WAF；不会记录请求；也不会编译为任何云资源。它的存在只是为了让架构图更清晰易读。

如果你需要 HTTPS + 真正的公网入口，请使用 **自定义域名**。如果你需要集中式的请求管理，请使用 **API Gateway**。**公网流量** 表达的是"外部世界"这一 *概念*，并不是网关。
    `.trim(),
  },
  compilesTo: {
    // Intentionally empty — canvas-only block, no infra emitted.
  },
  relatedConcepts: ['Network.CustomDomain', 'Network.APIGateway', 'Compute.StaticSite', 'Compute.SSRSite'],
};
