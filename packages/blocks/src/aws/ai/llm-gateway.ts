import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLlmGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('llm-gateway', {
  blockType: 'aws-llm-gateway',
  category: 'ai',
  name: 'AWS LLM Gateway',
  description: 'AWS Bedrock. LLM API proxy, rate limiting + fallback.',
  icon: 'BrainCircuit',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'AI.LLMGateway',
    runtime: 'Amazon Bedrock',
    port: 4000,
  },
});
