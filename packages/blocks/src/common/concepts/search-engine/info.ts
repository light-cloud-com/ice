import { defineSnippets } from '../_shared/code-snippets';
import type { InfoContent } from '../_shared/types';

export const searchEngineInfo: InfoContent = {
  overview: {
    markdown: `
# Search

Full-text search, faceted filtering, typo-tolerance, and aggregations across
millions of documents — without bolting Elasticsearch onto your Postgres box.

## When to use

- Site-wide search bars (products, articles, knowledge base)
- Faceted filters (category × price × rating × in-stock)
- Log search and aggregations (security events, observability)
- Geospatial search and ranking

## When NOT to use

- Embeddings / semantic similarity → **Vector DB**
- Exact-match key lookups → **Redis Cache** or your existing **Postgres**
- Analytical aggregations over historical events → **Data Warehouse**
- Tiny corpus (< 100k docs, simple LIKE queries fine) → just use **Postgres**
  with \`tsvector\` / \`pg_trgm\`

## Indexing pattern

Most apps index asynchronously: app writes to **Postgres**, a **Worker**
listens to a change feed and pushes documents to Search. The query path
hits Search directly; the source-of-truth hits Postgres. This decouples
indexing latency from request-path latency.
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'OpenSearch Domain', type: 'aws_opensearch_domain' },
      { name: 'Domain Policy', type: 'aws_opensearch_domain_policy', optional: true },
    ],
    gcp: [
      { name: 'Vertex AI Search Engine', type: 'google_discovery_engine_search_engine' },
      { name: 'Data Store', type: 'google_discovery_engine_data_store' },
    ],
    azure: [
      { name: 'Cognitive Search Service', type: 'azurerm_search_service' },
      { name: 'Search Index', type: 'azurerm_search_index', optional: true },
    ],
  },
  snippets: defineSnippets({
    ts: `// OpenSearch via @opensearch-project/opensearch
import { Client } from '@opensearch-project/opensearch';
const client = new Client({ node: process.env.OPENSEARCH_URL });
const result = await client.search({
  index: 'products',
  body: { query: { multi_match: { query: 'wireless headphones', fields: ['name^3', 'description'] } } },
});`,
    py: `# OpenSearch via opensearch-py
from opensearchpy import OpenSearch
client = OpenSearch(hosts=[os.environ['OPENSEARCH_URL']])
result = client.search(
    index='products',
    body={'query': {'multi_match': {'query': 'laptop', 'fields': ['name^3', 'description']}}},
)`,
    go: `// OpenSearch via opensearch-go
client, _ := opensearch.NewClient(opensearch.Config{Addresses: []string{os.Getenv("OPENSEARCH_URL")}})
res, _ := client.Search(client.Search.WithIndex("products"), client.Search.WithBody(strings.NewReader(\`{"query":{"match":{"name":"shoes"}}}\`)))`,
  }),
  links: [
    { label: 'AWS OpenSearch', url: 'https://docs.aws.amazon.com/opensearch-service/' },
    { label: 'Vertex AI Search', url: 'https://cloud.google.com/vertex-ai-search/docs' },
    { label: 'Azure Cognitive Search', url: 'https://learn.microsoft.com/en-us/azure/search/' },
  ],
  relatedConcepts: ['Database.PostgreSQL', 'AI.VectorDB', 'Compute.Worker'],
};
