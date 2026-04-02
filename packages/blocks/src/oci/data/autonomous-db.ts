/**
 * Autonomous DB Blueprint — Flat Card
 *
 * Database.AutonomousDB — OCI self-managing Oracle database.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const autonomousDbBlueprint: BlockBlueprint = createBlueprintFromResource('autonomous-db', {
  iceType: 'Database.AutonomousDB',
  category: 'data',
  name: 'Autonomous DB',
  description: 'Oracle Cloud self-managing database.',
  icon: 'Database',
  providers: ['oci'],
  nodeDataDefaults: {
    runtime: 'Oracle 19c',
  },
});
