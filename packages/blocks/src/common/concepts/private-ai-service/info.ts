import type { InfoContent } from '../_shared/types';

export const privateAiServiceInfo: InfoContent = {
  overview: {
    markdown: `
# Private AI Service

A self-hosted large language model running on your own cloud infrastructure.
Your data never leaves your environment — no calls to OpenAI/Anthropic/Google.

## What you get

- GPU-backed container (vLLM, TGI, or Ollama) running an open-weight model
- **Vector DB** alongside for RAG
- HTTP endpoint compatible with the OpenAI chat-completions API

## When to use

- Compliance / data residency requirements (healthcare, government, EU GDPR)
- Sensitive internal data you won't send to a third party
- Cost control at high throughput (large flat GPU bill vs. per-token billing)

## Tradeoffs

- Expensive baseline cost (GPUs run 24/7)
- You manage model upgrades, scaling, and drift
- Open-weight models lag closed-weight flagships by ~6-12 months
    `.trim(),
    markdownZh: `
# 私有 AI 服务

在自己的云基础设施上自托管的大语言模型。数据始终留在你的环境内 —— 不会调用 OpenAI / Anthropic / Google。

## 你将获得

- 基于 GPU 的容器（vLLM、TGI 或 Ollama），运行开源权重模型
- 配套的 **向量数据库**，用于 RAG
- 与 OpenAI chat-completions API 兼容的 HTTP 端点

## 适用场景

- 合规 / 数据驻留要求（医疗、政府、欧盟 GDPR）
- 不愿发送到第三方的敏感内部数据
- 在高吞吐场景下控制成本（一笔较大的固定 GPU 费用 vs. 按 token 计费）

## 权衡取舍

- 基础成本较高（GPU 全天候 24/7 运行）
- 需要自己负责模型升级、扩缩容与漂移管理
- 开源权重模型相比闭源旗舰大约滞后 6-12 个月
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'EKS GPU node group', type: 'aws_eks_node_group', role: 'GPU compute' },
      { name: 'OpenSearch (vectors)', type: 'aws_opensearch_domain' },
    ],
    gcp: [
      { name: 'GKE GPU node pool', type: 'google_container_node_pool' },
      { name: 'Vertex Vector Search', type: 'google_vertex_ai_index' },
    ],
    azure: [
      { name: 'AKS GPU node pool', type: 'azurerm_kubernetes_cluster_node_pool' },
      { name: 'AI Search', type: 'azurerm_search_service' },
    ],
  },
  relatedConcepts: ['AI.LLMGateway', 'Database.Vector', 'Compute.Container'],
};
