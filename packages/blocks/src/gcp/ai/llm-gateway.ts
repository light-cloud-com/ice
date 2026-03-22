import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  blockType: 'gcp-llm-gateway',
  category: 'ai',
  name: 'GCP LLM Gateway',
  description: 'Google Vertex AI. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'AI.LLMGateway',
    runtime: 'Vertex AI',
    port: 4000,
  },
});
