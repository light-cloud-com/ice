import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource(
  'public-traffic',
  {
    blockType: 'aws-public-traffic',
    category: 'networking',
    name: 'AWS Public Traffic',
    description: 'AWS CloudFront. Internet entry point.',
    icon: 'Users',
    providers: ['aws'],
    nodeDataDefaults: {
      iceType: 'Network.Internet',
      domain: 'public',
    },
  }
);
