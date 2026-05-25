import type { PortSchema } from '../types';

/**
 * Source.Repository — provides a single `repository` output. Wiring it to
 * a service writes the repo URL into the service's `repository` property
 * (PROPAGATION_RULES handles `branch`, `buildCommand`, `outputDirectory`
 * propagation as a side-effect).
 */
export const sourceRepositorySchema: PortSchema = {
  iceType: 'Source.Repository',
  base: [
    {
      id: 'repository-out',
      direction: 'out',
      role: 'repository',
      label: 'Source code',
      side: 'right',
      shape: 'diamond',
      peerStyle: 'Source',
    },
  ],
};
