import type { BlockBlueprint } from '../../types';

export const githubRepositoryBlueprint: BlockBlueprint = {
  iceType: 'Source.Repository',
  resourceId: 'github-repository',
  name: 'GitHub Repository',
  description: 'Source code repository. Connect to a service to deploy from.',
  icon: 'GitBranch',
  category: 'source',
  providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'],
  nodeData: {
    behavior: 'source',
    repository: '',
    branch: 'main',
    path: '/',
    buildCommand: '',
    outputDirectory: '',
    autoDeploy: true,
  },
};
