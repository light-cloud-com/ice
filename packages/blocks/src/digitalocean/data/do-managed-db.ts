/**
 * DO Managed Database Blueprint — Flat Card
 *
 * Database.DOManagedDB — DigitalOcean simple managed DB.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const doManagedDbBlueprint: BlockBlueprint = createBlueprintFromResource('do-managed-db', {
  iceType: 'Database.DOManagedDB',
  category: 'data',
  name: 'Managed Database',
  description: 'DigitalOcean managed DB. Postgres/MySQL/Redis.',
  icon: 'Database',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    runtime: 'PostgreSQL 16',
    port: 5432,
  },
});
