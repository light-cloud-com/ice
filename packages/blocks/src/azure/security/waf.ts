import type { BlockBlueprint } from '../../types';

export const azureWafBlueprint: BlockBlueprint = {
  iceType: 'Security.WAF',
  resourceId: 'waf',
  name: 'Azure WAF',
  description: 'Web Application Firewall. Front Door or Application Gateway WAF policies.',
  icon: 'ShieldAlert',
  category: 'security',
  providers: ['azure'],
  nodeData: {
    iceType: 'Security.WAF',
    behavior: 'singleton',
    status: 'active',
  },
};
