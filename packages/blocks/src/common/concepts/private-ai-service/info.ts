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
