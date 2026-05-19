import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const mysqlConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('mysql-db', {
    iceType: 'Database.MySQL',
    category: 'data',
    name: 'MySQL',
    description: 'Managed MySQL database. Classic relational DB. Great with legacy codebases, WordPress, Drupal.',
    icon: 'Database',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'MySQL', version: '8.0', tier: 'small', storageGb: 20, backups: true },
  }),
  conceptId: 'mysql',
  visualFamily: 'data',
};
