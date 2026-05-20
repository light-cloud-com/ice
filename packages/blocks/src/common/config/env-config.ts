import type { BlockBlueprint } from '../../types';

export const envConfigBlueprint: BlockBlueprint = {
  iceType: 'Config.Environment',
  resourceId: 'env-config',
  name: 'Environment Variables',
  description: 'Key-value environment variables. Connect to services that need them.',
  icon: 'FileCode',
  category: 'config',
  providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
  nodeData: {
    iceType: 'Config.Environment',
    behavior: 'config',
    variables: [],
    label: 'Environment Variables',
  },
};
