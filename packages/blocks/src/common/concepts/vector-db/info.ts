import type { InfoContent } from '../_shared/types';

export const vectorDbInfo: InfoContent = {
  overview: {
    markdown: `
# Vector DB

A database specialized for similarity search over high-dimensional vectors
(embeddings). Powers semantic search, RAG chatbots, and recommendation
systems.

## When to use

- **RAG** (retrieval-augmented generation) for LLM apps
- Semantic search ("find docs similar to this one")
- Recommendation systems based on embeddings
- Deduplication, clustering

Pair with an **LLM Gateway** for the full RAG pipeline.
    `.trim(),
    markdownZh: `
# Vector DB

专为高维向量(embeddings)相似度搜索而设计的数据库。为语义搜索、RAG 聊天机器人和推荐系统提供支撑。

## 适用场景

- 面向 LLM 应用的 **RAG**(检索增强生成)
- 语义搜索("找出与这篇相似的文档")
- 基于 embeddings 的推荐系统
- 去重、聚类

搭配 **LLM Gateway** 即可构建完整的 RAG 流水线。
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'OpenSearch with k-NN', type: 'aws_opensearch_domain' }],
    gcp: [{ name: 'Vertex AI Vector Search Index', type: 'google_vertex_ai_index' }],
    azure: [{ name: 'Azure AI Search', type: 'azurerm_search_service' }],
  },
  relatedConcepts: ['AI.LLMGateway', 'Database.PostgreSQL'],
};
