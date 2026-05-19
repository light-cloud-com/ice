import type { InfoContent } from '../_shared/types';

export const apiGatewayInfo: InfoContent = {
  overview: {
    markdown: `
# API Gateway

A managed front door for your APIs. Handles HTTPS, routing, throttling,
authentication, API key management, and usage metering — so your backend
services don't have to.

## When to use

- Multiple backends behind one public URL
- Rate limiting, API keys, usage plans
- Request/response transformation at the edge
- WebSocket APIs

## vs Custom Domain

**Custom Domain** gives you HTTPS + hostname in front of a single service.
**API Gateway** is heavier — full API management with routes, throttling,
and authorizers. Use API Gateway when you have real API-management needs;
otherwise Custom Domain is simpler and cheaper.
    `.trim(),
    markdownZh: `
# API Gateway

API 的托管式统一入口。负责 HTTPS、路由、限流、身份验证、API 密钥管理和用量计量 —— 让后端服务专注于业务逻辑。

## 适用场景

- 多个后端共用同一公开 URL
- 限流、API 密钥、用量套餐
- 在边缘进行请求/响应转换
- WebSocket API

## 与"自定义域名"的区别

**自定义域名** 只是在单个服务前提供 HTTPS + 主机名。
**API Gateway** 则更重 —— 提供完整的 API 管理能力，包括路由、限流和授权器。当确实有 API 管理需求时使用 API Gateway；否则 **自定义域名** 更简单、更便宜。
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'API Gateway REST API', type: 'aws_api_gateway_rest_api' },
      { name: 'Stage', type: 'aws_api_gateway_stage' },
      { name: 'Deployment', type: 'aws_api_gateway_deployment' },
    ],
    gcp: [{ name: 'API Gateway', type: 'google_api_gateway_gateway' }],
    azure: [{ name: 'API Management', type: 'azurerm_api_management' }],
  },
  relatedConcepts: ['Network.CustomDomain', 'Compute.Container', 'Compute.ServerlessFunction'],
};
