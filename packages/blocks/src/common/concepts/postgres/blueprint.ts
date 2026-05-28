import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const postgresConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('postgres-db', {
    iceType: 'Database.PostgreSQL',
    category: 'data',
    name: 'Postgres',
    description: 'Managed PostgreSQL database. SQL, ACID transactions, JSON, full-text search, the works.',
    icon: 'Database',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
    nodeDataDefaults: {
      label: 'Postgres',
      version: '15',
      tier: 'small',
      storageGb: 20,
      backups: true,
    },
  }),
  conceptId: 'postgres',
  visualFamily: 'data',
};
