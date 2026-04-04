import type { BlockBlueprint } from '../../types';

export const gcpWafBlueprint: BlockBlueprint = {
  iceType: 'Security.WAF',
  resourceId: 'waf',
  name: 'GCP Cloud Armor',
  description: 'Web Application Firewall. DDoS protection, IP allowlists, WAF rules.',
  icon: 'ShieldAlert',
  category: 'security',
  providers: ['gcp'],
  nodeData: {
    iceType: 'Security.WAF',
    behavior: 'singleton',
    status: 'active',
  },
};
