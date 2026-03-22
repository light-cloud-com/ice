/**
 * DO Managed Database Blueprint — Flat Card
 *
 * Database.DOManagedDB — DigitalOcean simple managed DB.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const doManagedDbBlueprint: BlockBlueprint = createBlueprintFromResource('do-managed-db', {
  blockType: 'do-managed-db',
  category: 'data',
  name: 'Managed Database',
  description: 'DigitalOcean managed DB. Postgres/MySQL/Redis.',
  icon: 'Database',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Database.DOManagedDB',
    runtime: 'PostgreSQL 16',
    port: 5432,
  },
});
