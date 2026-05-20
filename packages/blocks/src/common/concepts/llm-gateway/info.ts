import type { InfoContent } from '../_shared/types';

export const llmGatewayInfo: InfoContent = {
  overview: {
    markdown: `
# LLM Gateway

A managed gateway for large language models. Your backend calls this block
instead of hitting vendor APIs directly — you get auth, quotas, logging,
and the ability to swap models behind one URL.

## When to use

- Production apps calling GPT-4 / Claude / Gemini
- Multi-model routing (cheap fast model for simple queries, big model for hard ones)
- Central billing / audit across many apps

## Alternatives

For simple projects, call the vendor API directly from your **Scalable Backend**
with an API key in **Secret Store**. Use LLM Gateway when you need the
centralization benefits.
    `.trim(),
    markdownZh: `
# LLM Gateway

针对大语言模型的托管式网关。你的后端调用此块，而非直接访问厂商 API —— 由它统一处理鉴权、配额、日志，并支持在同一 URL 后切换模型。

## 适用场景

- 调用 GPT-4 / Claude / Gemini 的生产级应用
- 多模型路由（简单查询走轻量快速模型，复杂查询走大模型）
- 跨多个应用的集中计费 / 审计

## 替代方案

对于简单项目，可直接从 **可扩展后端** 调用厂商 API，并将 API 密钥放在 **密钥库** 中。只有在确实需要这种集中化优势时，才使用 LLM Gateway。
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'Bedrock Invocation Role', type: 'aws_iam_role', role: 'access to Bedrock models' }],
    gcp: [{ name: 'Vertex AI Endpoint', type: 'google_vertex_ai_endpoint' }],
    azure: [
      { name: 'Azure OpenAI Deployment', type: 'azurerm_cognitive_deployment' },
      { name: 'Cognitive Account', type: 'azurerm_cognitive_account' },
    ],
  },
  relatedConcepts: ['Database.Vector', 'Compute.Container', 'AI.PrivateAIService'],
};
