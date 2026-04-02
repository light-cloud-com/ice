import type { BlockBlueprint } from '../../types';

export const domainBlueprint: BlockBlueprint = {
  iceType: 'Network.Domain',
  resourceId: 'domain',
  name: 'Domain',
  description: 'Custom domain and routing. Connect to services to expose them.',
  icon: 'Globe',
  category: 'networking',
  providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
  nodeData: {
    iceType: 'Network.Domain',
    behavior: 'networking',
    hostname: '',
    subdomain: '',
    sslMode: 'auto',
    dnsProvider: '',
    label: 'Domain',
  },
};
