import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  iceType: 'AI.LLMGateway',
  category: 'ai',
  name: 'GCP LLM Gateway',
  description: 'Google Vertex AI. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Vertex AI',
    port: 4000,
  },
});
