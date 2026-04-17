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
  },
  compilesTo: {
    aws: [{ name: 'OpenSearch with k-NN', type: 'aws_opensearch_domain' }],
    gcp: [{ name: 'Vertex AI Vector Search Index', type: 'google_vertex_ai_index' }],
    azure: [{ name: 'Azure AI Search', type: 'azurerm_search_service' }],
  },
  relatedConcepts: ['AI.LLMGateway', 'Database.PostgreSQL'],
};
