import type { PortSchema } from '../types';

export const aiVectorDbSchema: PortSchema = {
  iceType: 'AI.VectorDB',
  base: [
    {
      id: 'vector-out',
      direction: 'out',
      role: 'vector',
      label: 'Vector DB',
      side: 'right',
      shape: 'circle',
      peerStyle: 'AI',
    },
  ],
};

export const aiLlmGatewaySchema: PortSchema = {
  iceType: 'AI.LLMGateway',
  base: [
    {
      id: 'llm-out',
      direction: 'out',
      role: 'llm',
      label: 'LLM gateway',
      side: 'right',
      shape: 'circle',
      peerStyle: 'AI',
    },
  ],
};

/**
 * AI.PrivateAIService is itself a backend (it can be deployed and
 * fronted by a domain) so it exposes the standard service ports plus
 * the LLM out.
 */
export const aiPrivateAiServiceSchema: PortSchema = {
  iceType: 'AI.PrivateAIService',
  base: [
    {
      id: 'repository-in',
      direction: 'in',
      role: 'repository',
      label: 'Source code',
      property: 'repository',
      side: 'left',
      shape: 'diamond',
      peerStyle: 'Source',
    },
    {
      id: 'env-in',
      direction: 'in',
      role: 'env',
      label: 'Environment variables',
      property: 'env_vars',
      side: 'left',
      shape: 'ring',
      peerStyle: 'Config',
    },
    {
      id: 'secret-in',
      direction: 'in',
      role: 'secret',
      label: 'Secrets',
      property: 'secrets',
      side: 'left',
      shape: 'ring',
      peerStyle: 'Security',
    },
    {
      id: 'vector-in',
      direction: 'in',
      role: 'vector',
      label: 'Vector DB',
      side: 'left',
      shape: 'circle',
      peerStyle: 'AI',
    },
    {
      id: 'llm-out',
      direction: 'out',
      role: 'llm',
      label: 'LLM gateway',
      side: 'right',
      shape: 'circle',
      peerStyle: 'AI',
    },
    {
      id: 'web-out',
      direction: 'out',
      role: 'http-endpoint',
      label: 'Web (HTTPS)',
      port: 443,
      protocol: 'https',
      side: 'right',
      shape: 'circle',
      peerStyle: 'Network',
    },
  ],
};
