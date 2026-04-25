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
