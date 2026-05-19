import type { InfoContent } from '../_shared/types';

export const envConfigInfo: InfoContent = {
  overview: {
    markdown: `
# Env Config

A bag of environment variables that get injected into every connected
compute block at deploy time. Drop one on the canvas, wire it to a
**Scalable Backend** / **SSR Site** / **Worker** / **Serverless Function**,
and the variables show up as \`process.env.*\` in your code.

## What goes here

- Non-sensitive config (feature flags, external API base URLs, log levels)
- Public tokens and identifiers
- Runtime-tunable values that aren't secret

## What does NOT go here

- Passwords, API keys, signing keys → use **Secret Store**
- Database URLs for connected databases — ICE wires those automatically
- Values that should rotate on a schedule → **Secret Store** with rotation
    `.trim(),
    markdownZh: `
# 环境变量配置

一组环境变量,部署时会注入到每一个连接的计算块。将它放到画布上,连接到 **可扩展后端** / **SSR 站点** / **Worker** / **无服务器函数**,这些变量便会以 \`process.env.*\` 的形式出现在您的代码中。

## 应该放在这里

- 非敏感配置(功能开关、外部 API 基础 URL、日志级别)
- 公开的 token 和标识符
- 运行时可调、但不属于敏感信息的值

## 不应该放在这里

- 密码、API 密钥、签名密钥 → 使用 **密钥存储**
- 已连接数据库的连接 URL — ICE 会自动注入
- 需要按计划轮换的值 → 使用支持轮换的 **密钥存储**
    `.trim(),
  },
  // Env Config does not compile to a cloud resource — it's a design-time
  // bundle of key-value pairs that the deploy pipeline injects into the
  // environment of connected compute blocks.
  compilesTo: {},
  relatedConcepts: ['Security.Secret', 'Compute.Container', 'Compute.SSRSite', 'Compute.ServerlessFunction'],
};
