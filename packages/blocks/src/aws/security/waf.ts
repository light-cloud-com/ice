import type { BlockBlueprint } from '../../types';

export const awsWafBlueprint: BlockBlueprint = {
  iceType: 'Security.WAF',
  resourceId: 'waf',
  name: 'AWS WAF',
  description: 'Web Application Firewall. Protects against SQL injection, XSS, DDoS.',
  icon: 'ShieldAlert',
  category: 'security',
  providers: ['aws'],
  nodeData: {
    iceType: 'Security.WAF',
    behavior: 'singleton',
  },
};
